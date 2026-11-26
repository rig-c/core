# portrait — a 2.5D head turn, on plain Spine data

Vela breathes, blinks, shifts her gaze and turns her head a few degrees off
axis. The turn is the point: it is the move Live2D is bought for, built here out
of **`deform` keys plus per-part parallax on an ordinary Spine 4.3 skeleton** —
no second format, no runtime plugin, nothing the Spine editor cannot open.

⭐ **The one feature this example stars: `deform` used as a *projection* rather
than as a squash.** [AUTHORING §4.11](../../docs/AUTHORING.md) is the field
reference, [FACE.md](../../docs/FACE.md) is the recipe this example is the worked
material for, and [`squash`](../squash/) is the other example that stars it; the
difference is what the keys mean. `squash`'s two shapes are affine transforms of
a ball. These are the **perspective projection of a yaw**, and every number in
them — mesh offsets, bone translations, bone scales — comes off one line of
arithmetic that this README derives.

🆕 **And both halves of the turn now STATE that line instead of listing its
results.** The **mesh** keys did first
([#294](https://github.com/rig-c/core/issues/294),
[AUTHORING §4.11.1](../../docs/AUTHORING.md)): this example shipped with **160
hand-transcribed floats** across its 8 deform keys, and the same artifact now
comes out of four `transform` keys. The **bone** tracks followed
([#295](https://github.com/rig-c/core/issues/295),
[AUTHORING §4.5.1](../../docs/AUTHORING.md)): `turn` was **20 tracks and 81
keys**, sixteen of them the same two properties on six sibling bones, and it is
now **8 tracks and 33 keys** — two group tracks whose keys state a `yaw` and a
**depth per member**.

⭐ **Every table below is unchanged, because it is the same arithmetic.** What
changed is where the arithmetic's *inputs* live: the depth column of the tables
below used to exist only in this README, and it is now in `motion.json` where
the turn uses it. `rigc explain` prints the results — the offsets per vertex
([§4.11.2](../../docs/AUTHORING.md)) and the values per member
([§4.5.2](../../docs/AUTHORING.md)) — beside the model that produced them.

📐 It is also the measured experiment for
[issue #285](https://github.com/rig-c/core/issues/285). What it cost, where
it stops working and which tools were missing are in
**[FINDINGS.md](FINDINGS.md)** beside this file.

```
bun install                                     # once

bun cli.ts build   --rig gallery/portrait/rig.json \
                   --motion gallery/portrait/motion.json \
                   --out gallery/portrait/build
bun cli.ts render  --candidate gallery/portrait/build --fps 25 --max 640 \
                   --out gallery/portrait/render
bun cli.ts preview --candidate gallery/portrait/build \
                   --out gallery/portrait/preview.html

# do the cycles close on the poses they opened with? `--duration` is the animation's
# own length out of motion.json, and the tool REFUSES the reading when the set's last
# frame is not at it — `render` samples `i = 0..round(d x fps)`, which lands on `d`
# only when `d x fps` is a whole number (issue #337).
bun gallery/loop_seam.ts gallery/portrait/render/idle@25fps --duration 3.2
bun gallery/loop_seam.ts gallery/portrait/render/turn@25fps --duration 2.2

# `gaze` is 1.5s and `1.5 x 25 = 37.5`, so its 25 fps set's last frame sits at 1.52s —
# past the end, not the wrap point — and the tool says so instead of reporting a
# number. 1.5s lands on every even rate, so measure that one at 20 fps. Into `render/`
# (git-ignored, repository root) so the 25 fps sidecar above is left alone.
bun cli.ts render --candidate gallery/portrait/build --animation gaze --fps 20 --max 640 \
                  --out render
bun gallery/loop_seam.ts render/gaze@20fps --duration 1.5

# re-draw the 22 part PNGs. Needs rsvg-convert; the PNGs are committed, so this
# is for changing the art or checking that the committed bytes are the ones the
# script draws.
bun gallery/portrait/make_parts.ts
```

`build`, `render` and `preview` write into this directory and are **not
committed** — the specs and the part PNGs are, and those three commands
regenerate the rest. The frames to look at:

| Frame | What it is |
| --- | --- |
| `render/turn@25fps/f0016.png` | the yaw arrives. **Look at this one at 1:1** — the contact sheet cannot show you whether the face turned or merely slid |
| `render/turn@25fps/f0000.png` | rest, for the comparison. The pair is the whole example |
| `render/idle@25fps/f0028.png` | the blink, shut |
| `render/gaze@25fps/f0015.png` | the gaze, held. The iris has moved 7 units and its highlight 2.8 |

📏 **Re-rendering at another `--max` to look closely is expected, and it changes
the seam figure.** Every pixel count in *What was verified* below is a reading at
the size it was taken at, `--max 640` unless the row says otherwise, and the
seam rows are the ones where that matters
([#336](https://github.com/rig-c/core/issues/336)) — `idle`'s reads 0 px at
640 and 1 974 px at 57/255 at 1782. `loop_seam.ts` prints the `--max` it
measured for exactly this reason; quote it beside any figure taken from it.

---

## The character

**Vela**, and she is a second cast member rather than another shot of Rigby.
That is a departure from [the gallery's own rule](../README.md) that its
examples share one drawing, so here is the defence.

A 2.5D turn reads off four things: a **brow** that frames an eye, an **iris and
a highlight as separate parts**, **hair in layers** that can lag the skull, and
a **cheek-to-jaw silhouette** with a landmark in it to foreshorten. Rigby has a
muzzle. A muzzle points wherever the head points, so a mascot's turn is a bone
rotation and nothing else — which is precisely the move this example is not
about. Drawing the turn on him would have measured a rotation and called it a
projection.

What is *not* new is the art language. [`../rigby.ts`](../rigby.ts) still owns
every colour, the outline weight and the rasteriser: his fur tones are her skin,
his scarf's teal is her hair, the warm accent his props use is her eyes, and
`SW` is `SW`. She lives in
[`make_parts.ts`](make_parts.ts) rather than beside him for the reason that file
states about its own optional parts — `rasterise(rigbyParts(), …)` writes its
whole list, so a drawing one example needs would otherwise land in every other
example's `parts/`.

**22 parts, 27 bones, 22 slots.** The part list is in `make_parts.ts`; the
splits that are load-bearing are these:

| Split | Why the parts are separate |
| --- | --- |
| `eye` / `iris` / `spark` / `lid`, ×2 | the socket holds still, the iris travels, the highlight travels **40% as far**, and the lid sweeps over all three. One drawing of an eye can do none of it |
| `hair_back` / `hair_bang` / `hair_lock_l` / `hair_lock_r` / `ahoge` | five layers at five depths, so the turn moves them by five different amounts and the idle's follow-through can stagger them |
| `brow_l` / `brow_r`, `nose`, `mouth` | each one is at its own `(x, z)` on the skull, and the turn's whole point is that those differ |
| `neck` on its own bone under `neckbase` | the neck plate has to take a *fraction* of the head's shift, so it cannot be an ancestor of the head. `neckbase` is the shared parent; `neck` carries the plate and `headroll` carries the head |

⭐ **`idle` keys `headroll`, never `head`.** `head` is the head mesh's own slot
bone, and `A15_IDLE_NO_MESH_BONE_KEYS` refuses an `idle` that keys one — a
`rig-play` renderer rule about meshes never idle-skipping. Putting the head's
pivot on its own bone one link up satisfies it and is the better rig anyway: a
head rotates about the top of the neck, not about the middle of its own face.

---

## ⭐ The turn, and where its numbers come from

### One line of arithmetic

Treat the face as painted on a cylinder standing on the skull's vertical axis. A
yaw of `t` about that axis sends a point at `(x, z)` — `x` across the screen, `z`
toward the viewer — to

```
x' = x·cos t − z·sin t
```

so the shift a part takes is

```
dx = x·(cos t − 1) − z·sin t
      \__________/    \______/
       second order    the whole
       (the head       of the move
        narrows by
        cos t)
```

**That is the entire model.** Every number in `turn` is that expression
evaluated somewhere, and the two terms are worth reading separately:

- `−z·sin t` is proportional to **depth**. A part further forward travels
  further. That is what parallax *is*, and it is why the fringe moves more than
  the face and the back hair moves the other way.
- `x·(cos t − 1)` pulls both edges inward by the same tiny amount, which is the
  head narrowing to `cos t` of its width. At 12° that is 2.2%.

The yaw is **12°**, held, and released — `t = 0.209` rad, `cos t − 1 =
−0.021852`, `sin t = 0.207912`.

### The two meshes

Both are grids on one column table, and both list their vertices **perimeter
first** — the order Spine's `hull` needs (see *`hull` is 16* below):

```
head       340 × 380 plate, R = 170        hair_bang   372 × 168 plate, R = 196
  5 columns × 5 rows = 25 vertices           5 columns × 3 rows = 15 vertices
  32 triangles                                16 triangles

  columns  x = −162, −120, 0, 120, 162      columns  x = −170, −120, 0, 120, 170
  rows     y = 180, 90, 0, −90, −180        rows     y = 80, 0, −80
  z = √(R² − x²)                            z = √(R² − x²)
```

`R` is the plate's own radius, and the **26-unit difference between them is the
fringe's stand-off from the skull** — the one number in the rig that exists only
to make the parallax. It buys `26 · sin 12° = 5.4px` of extra travel at the
centre column, measured at 5.406 on the artifact.

Each column's offset is `dx` at its own `(x, z)`, and every row gets the same
value because a yaw does not move anything vertically:

| `x` | `z = √(R²−x²)` | `dx` at 12° | `x + dx` |
| --- | --- | --- | --- |
| −162 | 51.536 | **−7.175** | −169.175 |
| −120 | 120.416 | **−22.414** | −142.414 |
| 0 | 170 | **−35.345** | −35.345 |
| 120 | 120.416 | **−27.658** | 92.342 |
| 162 | 51.536 | **−14.255** | 147.745 |

The run the compiler writes is that row of five, repeated five times, with a `0`
for every `y` — and the key that says so is the model, not the run:

```json
{ "t": 0.62, "transform": { "kind": "yaw", "radius": 170, "degrees": 12 }, "ease": "swell" }
```

⇒ **`radius` is the `R` of the column table above and `degrees` is the angle**,
which is the whole input; `explain` prints the 50 numbers it produced so the
table and the artifact can be read against each other:

**No run reproduces this:** abridged — the last three lines stand in for five more the run prints
```
      t=0.62    deform[0..50]  25 pair(s)                      stepped
               transform yaw  radius=170 degrees=12
               dx = (x−about)·(cos t − 1) − z·sin t,   z = √(radius² − (x−about)²)
                 t = 0.20944 rad
                 cos t − 1 = -0.021852
                 sin t = 0.207912
                 centre shift = −radius·sin t = -35.344986
               25 vertices, largest offset 35.344986px at vertex 2
                 v  0 (-7.17493, 0)  v  1 (-22.413595, 0)  v  2 (-35.344986, 0)  v  3 (-27.65817, 0)
                 v  4 (-14.255108, 0)  v  5 (-14.255108, 0)  v  6 (-14.255108, 0)  v  7 (-14.255108, 0)
                 …five more lines: the run is in list order, so `v 0`–`v 4` are the top row's five
                 values, `v 4`–`v 8` the right column's five copies of one value, and so on around
                 the perimeter before the nine interior vertices close the list
```

📐 **The transcription it replaced agreed with it to 0.000437 px**, which is
identical at the three decimals this README quotes — measured by compiling both
spellings and comparing all 160 emitted numbers. The reason the digits differ at
all is that the hand table was rounded to three places and the compiler quantises
to six.

🚨 **The columns are not evenly spaced, and that is the trick.** `−162, −120, 0,
120, 162` puts them dense near the silhouette and sparse in the middle, which is
the sampling a cosine needs: the centre of the face travels `R·sin t` and the
edges barely travel at all, so the interesting part of the curve is at the edges.
Five evenly spaced columns spend their resolution where nothing happens.

What the mesh then does to the drawing is a **non-uniform horizontal
redistribution** — measured on the artifact, at the widest row:

| Band, from the far edge | Rest width | At 12° | Ratio |
| --- | --- | --- | --- |
| −162 → −120 | 42.0 | 26.75 | **0.637** |
| −120 → 0 | 120.0 | 107.03 | 0.892 |
| 0 → 120 | 120.0 | 127.64 | 1.064 |
| 120 → 162 | 42.0 | 55.38 | **1.319** |

The far side compresses to 64%, the near side stretches to 132%, and the ink
outline inside each band compresses and stretches with it. That gradient is what
makes it read as a turn instead of a slide.

📌 **The two ends of that table are `explain`'s own output now** — the `DEFORM`
block ([AUTHORING §4.11.2](../../docs/AUTHORING.md), issue
[#316](https://github.com/rig-c/core/issues/316)) measures the posed
triangles at each key, so the ratios above are re-derivable by running the tool
rather than by hand:

```
  DEFORM  turn  default/head/head  key 1  t=0.620000  transform yaw  radius=170 degrees=12
          frame      played on a track
          moved      25 of 25 vertices, worst 35.3450px at v2
          area       min x0.637174 tri 17   max x1.319122 tri 31   (32 triangles, 0 with no area at the cleared pose, band 0.146694px²)
          stretch    max x1.319121 tri 22   min x0.637175 tri 8
          winding    32 of 32 kept, 0 collapsed
```

`hair_bang`'s own key, at `radius: 196`, comes to `x0.739378 … x1.216918` on the
same 12° — a shallower gradient, because the fringe rides a **larger** sphere
(the skull's 170 plus its own depth in front of it) and its columns therefore sit
relatively nearer the centre of it. That is the depth argument below, as a
printed figure.

⚠️ **`hull` is 16, derived from the triangles, and the vertex order is what lets
it be.** A grid's perimeter is 16 of its 25 vertices, and Spine's `hull` is the
first `hull` vertices of the list in order — so the list walks the perimeter
first (top row, right column, bottom row, left column) and puts the 9 interior
vertices after it. rigc reads the number off the triangles and refuses a
row-major list with that walk printed as the fix
([AUTHORING §3.4](../../docs/AUTHORING.md), [FACE §4.3](../../docs/FACE.md)). It
used to write `hull: 0` here, which the editor's import repaired by making every
vertex a hull vertex — [#368](https://github.com/rig-c/core/issues/368)
records that round trip; the frames are byte-identical either way.

⚠️ **The `MESH` line reports a large overshoot and it is not a defect.** A
rectangular grid over an oval face has transparent corners:

```
MESH  head         authored 25 vertices / 32 triangles  (budget 32)  bones=[head]  attachments=[head]  covers 100.00% of the art, reaching 95.90px past it
```

`covers 100.00%` is what matters — nothing of the drawing is outside the
triangles, which is [`squash`](../squash/)'s lesson applied before the first
build rather than after the first render. The 95.90px is the corner, and a mesh
that hugged the silhouette instead would have to be a `contour`, which cannot be
a grid and has no interior vertices to redistribute.

### The features: one shared shift, then depth

Six feature bones hang off **`faceshift`**, a bone at the head plate's own
origin whose only job is to carry the part of the move that every feature
shares:

```
faceshift.translatex = −R·sin t = −35.345      ← the same number as the mesh's centre column
```

Each feature then keys only its **residual**, which has its own closed form:

```
residual(x, z) = dx(x, z) − (−R·sin t)
               = x·(cos t − 1) + (R − z)·sin t
                                 \_______/
                                  the part's depth
                                  BELOW the skull surface
```

⭐ **So a feature's own track is nothing but its depth times `sin t`.** That is
the sentence this example exists to produce, and it is why the numbers are small
enough to read:

| Bone | `x` | `z` | `dx` | residual | `scalex` |
| --- | --- | --- | --- | --- | --- |
| `eye_l` (far) | −62 | 150 | −29.832 | **5.513** | **0.8922** |
| `eye_r` (near) | 62 | 150 | −32.542 | **2.803** | **1.0641** |
| `brow_l` | −62 | 158 | −31.495 | 3.850 | 0.8966 |
| `brow_r` | 62 | 158 | −34.205 | 1.140 | 1.0597 |
| `nose` | 0 | 192 | −39.919 | **−4.574** | 0.9781 |
| `mouth` | 0 | 166 | −34.513 | 0.832 | 0.9781 |

The nose is the only **negative** residual, because it is the only feature in
front of the skull surface — it protrudes 22 units, and 22·sin 12° = 4.57 is
exactly how much further left it goes than the cheek it sits on. That is the
single most turn-diagnostic number in the file.

🆕 **And the `z` column of that table is now in `motion.json`, which is the point
of [#295](https://github.com/rig-c/core/issues/295) rather than a side effect
of it.** One group track states the model and a depth per member; `carried` is
the shared shift above, stated:

```json
{ "group": "features", "property": "translatex", "keys": [
    { "t": 0,    "v": [0], "ease": "rise" },
    { "t": 0.62, "derive": { "kind": "yaw", "degrees": 12, "carried": 170,
                             "depth": { "eye_l": 150, "eye_r": 150, "brow_l": 158,
                                        "brow_r": 158, "nose": 192, "mouth": 166 } },
      "ease": "swell" },
    { "t": 1.5,  "derive": { "…the same model…" }, "ease": "settle" },
    { "t": 2.2,  "v": [0] } ] }
```

⇒ **The residual column is what `rigc explain` prints** — a row per member with
the `x` it read off the rig and the depth the spec stated
([AUTHORING §4.5.2](../../docs/AUTHORING.md)), so the nose test above is reading
one sign rather than redoing the arithmetic against this README.

`scalex` is the foreshortening of the patch of surface a feature sits on:

```
scaleX = cos(α − t) / cos α        where α = atan2(x, z)
```

The far eye narrows to 89%, the near eye widens to 106%. `nose` and `mouth` sit
on the axis, so both are `cos t = 0.9781` — which used to mean they shared one
track through an `axis` group, the only place in `turn` where two parts could.
📌 **That group is gone**: `scalex` is the foreshortening projection of the same
`derive` kind (AUTHORING §4.5.1), so all six features are one track and the pair's
shared value falls out of `α = atan2(0, z) = 0`. A coincidence between two members
is no longer something an author has to spot and spend an entry on.

### 🚨 The iris does **not** foreshorten, and this is the finding

`iris` and `spark` are children of `eye`, so they inherit its `scalex` — and a
circular iris under `scalex 0.89` is an **ellipse**. That reads as a drawing
squashed sideways, not as a head turned, and it is the first thing to break as
the angle grows.

It is also wrong on the physics. If the character keeps looking at the camera
through the turn, her eyeball counter-rotates by the same angle the head yawed,
so the iris stays square-on and stays **circular**. The socket foreshortens; the
pupil does not.

The fix is one reciprocal per side, on two groups:

```json
"look_l": ["iris_l", "spark_l"],   scalex 1 / 0.8922 = 1.1208
"look_r": ["iris_r", "spark_r"],   scalex 1 / 1.0641 = 0.9398
```

⭐ **These two stay a plain shared value, and they are the case where a per-member
model is the wrong tool** — worth saying, because #295 landing is exactly the
reasoning that would spoil them. A counter-scale belongs to the **socket**, not to
the part: `spark_l` sits at local `x = −11` and takes the same `1.1208` as
`iris_l` at `0`, because what is cancelled is the socket's foreshortening and not
the highlight's own. The value is precisely *not* a function of the member's
position, so one number on a group is the true statement of it.

Their *positions* still ride the socket — a bone's scale moves its children's
local translation, so the highlight at `(−11, +11)` slides inward with the
surface it reflects off. Only the shape is held. Measured effect on the cliff:
without it the turn stops reading at about **18°**; with it, about **26°**.
[FINDINGS.md](FINDINGS.md) has the sweep.

### The rest of the cast

| Bone | `(x, z)` | `translatex` at 12° | What it is |
| --- | --- | --- | --- |
| `hairmass` | `(0, −55)` | **+11.435** | the back hair, and the only part that moves the **other way**. Its centroid is 55 behind the axis, so `−z·sin t` changes sign: as the face swings left the back of the head swings right, which is the strongest single depth cue in the shot |
| `lock_l` | `(−150, 100)` | −17.513 | the far sidelock — off-axis and shallow, so it travels only half as far as the face centre |
| `lock_r` | `(150, 100)` | −24.069 | the near sidelock |
| `ahoge` | `(−23, 20)` | −3.656 | the cowlick sits almost on the axis, so it barely moves. Correct, and it anchors the shot |
| `neck` | — | **−10** | 28% of the head's shift, and the one number in `turn` that is **not** derived — see below |
| `headroll` | — | rotate `−0.9` → `+1.6` | the anticipation and the roll |

🩹 **`neck`'s 28% is a fudge and it is labelled as one.** A neck twists: its top
follows the head almost entirely and its base hardly at all. A single rigid
plate can only take an average, and −10 is the value at which the chin stopped
hanging off the throat at 12°. A turn that had to read at 20° would need the
neck to be its own mesh with its own column table. That is the honest boundary of
this construction and it is in [FINDINGS.md](FINDINGS.md).

### Where the anticipation lives

[MOTION.md §3.6](../../docs/MOTION.md) asks for a counter-move at 5–10% of the
excursion, at 10–15% of the duration. `turn` has one, at `t = 0.26` (12% of
2.2 s) — and it is a **−0.9° counter-roll on `headroll`, not a counter-yaw.**

That is a cost decision, stated: a yaw anticipation is another **50-number
deform key** on the head plus 30 on the fringe, for a move that lasts a tenth of
a second and is 8% of the excursion. The roll channel buys the same read for one
key on one track. [FINDINGS.md](FINDINGS.md) prices it.

The roll also does §3.5's job. A yaw shift is a straight horizontal line, and
`translatex` draws exactly that; the 1.6° roll on `headroll` is what bends every
feature's path into an **arc**, because a rotation about the neck pivot carries
its descendants on a circle for free.

---

## `idle` — a breath and a blink

3.2 s, `loop: true`, 9 tracks, 37 keys.

🚨 **The breath scales the chest plate without scaling the head.** `torso` and
`chest` are **siblings** under `bust`, not a chain: `torso` carries the plate and
takes the `scale` key (1 → 1.005, 1.014), `chest` carries the neck-and-head chain
and takes a `translatey` (0 → 3.4). Parent the head chain to the bone that
scales and the whole face inflates 1.4% every breath — visible, and invisible in
the spec.

### The blink is lid parts, not an attachment swap

Rigby blinks with an `attachment` timeline: two drawings, `eyes` and
`eyes_shut`, stepped between ([`squash`](../squash/) does this and is right to).
This example blinks with a **lid plate translating 65 units down its own bone**,
and the reasons are all timing:

- **A swap has no shape.** A real blink is fast shut and slow open. Here it is
  `0.07 s` down and `0.16 s` open — a **1 : 2.3** asymmetry, with `rise` easing
  into the close and `settle` out of the open. A stepped timeline has one frame
  of transition and no curve to put an asymmetry in.
- **A swap has no partial.** A half-blink, a sleepy lid, a lid that rides the
  gaze — all of them are a fraction of the same channel, and none of them is a
  third drawing.
- **A swap has to dodge the frame grid.** `squash`'s blink key is at `0.399999`
  rather than `0.4` for [§4.5](../../docs/AUTHORING.md)'s reason: a stepped key
  exactly on a sample time can be missed by a player accumulating `1/fps`. A
  continuous channel does not care where the samples land.
- **What it costs:** 2 PNGs instead of 1, plus 2 bones and 2 slots.

Both lids are one `lids` group, so they blink together. An L/R offset of one
frame was tried and rejected — at 25 fps it does not read as a soft blink, it
reads as a wink.

The lid's own drawing has two constraints, both stated in `make_parts.ts`: its
**top 30 pixels** fade to transparent (so a translated plate of flat skin has no
edge on the brow), and its **sides run flush to the window edge** — that one is
a workaround for [issue #292](https://github.com/rig-c/core/issues/292), the
dark rim `rigc render` draws at every atlas-region edge.

### The follow-through

[MOTION.md §3.7](../../docs/MOTION.md)'s offset table, against the breath's own
extreme at 1.55 s:

| Part | Extreme | Offset | Overshoot |
| --- | --- | --- | --- |
| `chest` / `torso` (the driver) | 1.55 | — | — |
| `headroll` rotate | 1.15 / 2.40 | its own counter-swing | crosses once |
| `neck` rotate | 1.50 | **+11%** of the cycle after `headroll` | crosses once |
| `lock_l` rotate | 2.27 | **+22%** | −0.4° at 2.86 |
| `lock_r` rotate | 2.35 | **+25%**, and opposite in sign so the two locks are not one slab | +0.38° at 2.90 |
| `ahoge` rotate | 2.50 | **+30%** — loose and light, so it gets the largest offset and the largest overshoot | −0.9° at 2.98 |

⛔ **`idle` keys nothing on the iris, on purpose.** A completely still eye reads
as a mannequin and the temptation is to add a drift — but the iris is `gaze`'s
channel, and a scene that plays `gaze` on a second track over a looping `idle`
would then be blending two opinions about where she is looking. The channel
table is in [FINDINGS.md](FINDINGS.md); the loss is real and named.

---

## `gaze` — eyes lead, head follows, hair overlaps

1.5 s, one-shot, 8 tracks, 32 keys. [MOTION.md §3.7](../../docs/MOTION.md) end
to end:

| Track | Extreme | What it is |
| --- | --- | --- |
| `irises` translate | **0.22 s** | the eyes lead. `(7, −3)` — and 7 is a ceiling, not a taste: the iris's ink ring has radius 28.5 and the socket's opening is 36 half-wide, so `36 − 28.5 = 7.5` is as far as it can go before it crosses its own lash. The first draft keyed 9 |
| `sparks` translate | 0.22 s | `(2.8, −1.2)` — **40% of the iris**, arriving at the same time. A specular highlight is fixed to the light, not to the eyeball, so it lags in *distance* and not in time |
| `headroll` translatex + rotate | **0.40 s** | the head follows at **+12%** of the duration. A rigid 3.4-unit slide and a −1.2° roll |
| `brows` translatey | 0.34 s | +1.8, which turns a flick of the eyes into interest |
| `lock_l` / `lock_r` / `ahoge` rotate | 0.72 / 0.76 / 0.82 s | **+21% / +24% / +28%** after the head, each with one overshoot crossing |

🩹 **The head's follow is a slide, not a small yaw, and that was the cost showing
through.** A head following a gaze really does yaw a few degrees. Three degrees
of yaw here was a third pair of `deform` keys — 80 more hand-written numbers —
for a motion the viewer reads as "her head moved a little", so `gaze` slid the
head rigidly and said so. 🆕 **That price is gone**: a third pair of keys is now
`{ "kind": "yaw", "radius": 170, "degrees": 3 }` twice
([#294](https://github.com/rig-c/core/issues/294)). The slide still ships,
because changing what `gaze` looks like is an art decision this example has not
re-made and not a transcription it was forced into — which is exactly the
distinction [FINDINGS.md](FINDINGS.md) argued an instrument would buy.

There is no `clipping` attachment holding the iris inside the white. Spine has
them ([§3.4](../../docs/AUTHORING.md)) and they would lift the 7-unit ceiling,
but when this example was drawn the rule A11 refused one under `--profile
rig-play`, so an example carrying one would have built on only one of the two
profiles the gallery bar asks for. Issue #1404 retired A11 — the player that
profile names draws clips in both of its modes — and the example was not redrawn.

---

## What was verified

| | |
| --- | --- |
| `rigc build --profile spine` | green — the run's own verdict, quoted below the table, says how many rules measured anything and how many the profile left out |
| `rigc build --profile rig-play` | green — same, including `A13_MESH_BUDGET` against `invariants.meshTriangles: 32` and `A15_IDLE_NO_MESH_BONE_KEYS` against an `idle` that keys `headroll` rather than `head` |
| mesh coverage | **100.00%** on both meshes, measured against the PNGs they name (`head` reaching 95.90px past the art at its grid corners, `hair_bang` 55.22px) |
| **the yaw model, on the artifact** | every mesh column, every feature bone and every `scalex` posed by `spine-core` at `t = 1.0` and compared against `dx = x(cos t − 1) − z sin t` composed with the 1.6° roll: **agreement to under 0.001 px** on all 10 mesh columns and all 6 feature bones, and to 4 decimal places on all 6 scale values |
| the parallax | fringe centre travels **5.406px** further than the face centre; predicted `(196 − 170)·sin 12° = 5.406` |
| the head narrowing | ink edge to ink edge **309.0 → 302.2** units, and `309 · cos 12° = 302.2`. The far edge moves 9.8 units further out, the near edge 16.7 units in |
| the band ratios | **0.637 / 0.892 / 1.064 / 1.319**, measured on the posed mesh, matching the table above |
| the blink, as pixels | at the shut hold (`f0028`, `f0029`), hiding `eye_l`, `eye_r`, `iris_l`, `iris_r`, `spark_l`, `spark_r` entirely changes **0 pixels of 305 920** (worst channel difference 2) — the lid occludes the whole assembly. Positive control: at `f0000` the same substitution moves **8 183** pixels |
| `rigc render` | 81 + 39 + 56 frames at 25 fps, 478×640. Contact sheets **looked at** for all three, plus 1:1 crops of the turn extreme, the blink and the gaze — which is where four of the five art defects in the notes below were caught |
| loop seams | **at `--max 640`** — the size the commands above render: **0 / 255**, 0 pixels differing of 305 920, for **all three**: `idle` because it loops, and `gaze` and `turn` because a one-shot that returns to rest lands back on its opening pose exactly. 📏 The `--max` is part of the figure and not decoration — see the row below. ⚠️ Two of the three are read off the 25 fps sets above and the third is not, and the reason is arithmetic rather than art: `render` samples `i = 0..round(d × fps)`, so a set's last frame is at the duration only when `d × fps` is whole. `idle` (3.2 × 25 = 80) and `turn` (2.2 × 25 = 55) are; `gaze` (1.5 × 25 = **37.5**) is not, and its 25 fps last frame sits 0.02 s *past* 1.5 s — so `loop_seam.ts` refuses that pair rather than reporting it ([#337](https://github.com/rig-c/core/issues/337)). Re-rendered at **20 fps**, where all three products are whole, `gaze` reads **0 / 255, 0 pixels differing** too — and so do the other two (65 / 31 / 45 frames) |
| **the loop-seam figure does not survive a change of `--max`** | same build, same `--fps 25`, `idle` f0000 against f0080, one column per render scale: **320** → 5 px at 1/255 · **640** → **0 px at 0/255** · **1024** → 1 px at 1/255 · **1440** → 46 px at 1/255 · **1782** → **1974 px at 57/255**, worst pixel at (549,673), a sliver at one eye's lower lash. `turn` behaves the same way — 0 px at 640, **135 px at 57/255** at 1782 ([#336](https://github.com/rig-c/core/issues/336)) |
| what that column is, and is not | ⚠️ Three of the five scales read **1/255**, which is rounding. **1782** is `scale = 1.875` **exactly** — `loop_seam.ts` prints it — the one sampled scale at which the plates' integer art coordinates land on whole pixel boundaries, so this is an *amplification at a boundary-aligned scale* rather than a growing error. And the residual behind it has a measured bound: strip `idle` to the one track the issue isolates (`chest.translatey`, three keys, the middle one moving) and f0080 reads **353 px at 57/255** at `--max 1782`; add **one redundant key** so the final segment is *constant*, changing nothing else, and every frame from **f0075 (t = 3.00) through f0080 (t = 3.20)** is **0 pixels, 0/255** from f0000 — against 78 403 / 73 553 / 68 516 / 60 474 / 46 522 / 353 px for the same six frames of the moving version. ⇒ the rasteriser is exact for a pose it has already drawn, and what the column shows is a sub-quantisation curve residual crossing a pixel boundary. ⇒ **quote the `--max` beside any seam figure**; `loop_seam.ts` now prints it and says outright that the reading is scale-relative |
| `rigc preview` | boots in the official Spine Web Player 4.3 and draws all 3 animations — headless chromium over CDP, **0 console errors, 0 page exceptions, 0 log-level errors** |
| `bun run selftest` | includes `GALLERY_EXAMPLE_IS_GREEN[portrait]`, green with the example corpus fetched |
| part determinism | `make_parts.ts` twice ⇒ identical bytes for all 22 PNGs |
| **the re-authoring onto #295, against the artifact it replaced** | the 20-track spelling and this one are **structurally identical** — same timelines, same key counts, same curve shapes — and 102 emitted numbers moved, all of them the transcription's own rounding: worst **0.000385** on `eye_r.translatex` (`2.803` written by hand, `2.803385` derived). Posed and compared bone by bone at 60 fps over all three animations, `rigc bonedist --bones identity` reports a worst world-position drift of **6.90e-7 skeleton sizes = 0.00058 px** (`spark_r`, frame 38) and a worst world-scale drift of **4.80e-5** (`nose`, frame 38). ⚠️ Byte identity was **not** available and could not be: the hand-written values were rounded to 3–4 decimals and the model emits 6 |
| the same re-authoring, spelled as a `v` map | **byte-identical** to the pre-#295 artifact — 16 tracks collapsed to 2 with the numbers relocated and not recomputed, which is what makes the map form a pure relocation |
| `bun run typecheck` / `lint` | green |

**The two verdicts, verbatim** — the report's last rule line and the summary under
it. Quoted rather than paraphrased, so the selftest's transcript gate re-runs both
commands and compares them line for line: the figures here are read off the run
instead of being kept by hand
([#609](https://github.com/rig-c/core/issues/609)).

`rigc build`:

```
PROF  A30_STROKE_WITHIN_CAP_CONTAINMENT: archetype rule, not in profile "spine"
..    51 assertions: 18 measured (18 passed, 0 failed), 18 skipped, 15 not in profile "spine"
```

`rigc build --profile rig-play`:

```
SKIP  A30_STROKE_WITHIN_CAP_CONTAINMENT: the manifest declares no `stroke.cap_containment_ceiling`, so this cut has no measured containment ceiling
..    51 assertions: 25 measured (25 passed, 0 failed), 26 skipped, 0 not in profile "rig-play"
```

---

## What this cost — the authoring notes

**Two tool defects, both filed with reproductions.**
[#292](https://github.com/rig-c/core/issues/292) — `rigc render`'s
`bilinear` interpolates RGB in **straight**-alpha space, so every atlas-region
edge draws a one-pixel dark rim over what is behind it. Measured at −31/255 down
the forehead here and −60/255 in a minimal case of two parts that share one
colour. It has been invisible for four examples because every part in them has an
ink outline at its edge, and a dark rim on a dark line cannot be seen; a portrait
is the first rig whose plates are *supposed* to overlap invisibly.
[#293](https://github.com/rig-c/core/issues/293) — `setup: { "slot": null }`
crashes with a raw `TypeError` instead of a named refusal. Found by the probe
that isolated #292, which needed to hide one slot at a time.

**The seam took an hour and none of it was the mesh.** The first suspect was the
grid: faint vertical lines down the forehead, at what looked like column
positions. Building the same rig with the two meshes replaced by plain regions
and diffing the rest frame settled it in one command — **worst channel difference
1, zero pixels differing** — so the mesh was innocent and the lines were art
compositing. ⇒ **When a mesh is the new thing in a shot, build the region
version and diff it before reading a single vertex.** It is two minutes and it
halves the search space.

**Four of the five art defects were invisible on a contact sheet.** The dark
seam, the lid's fade letting the shut eye's lash show through as a grey smudge,
the iris crossing its own lash at the gaze extreme, and the forehead highlight
turning the lid's soft edge into a tonal step — every one of them was found at
1:1 or better and none of them at the 0.45× a sheet uses. [`squash`](../squash/)
says this and it was still worth re-learning: **the sheet is for whether the
motion reads; 1:1 is for whether the drawing arrived.** For a face, add a third
pass at 3–4× on the eyes, because that is where the reader will look.

**A proportional fade is a bug waiting for the plate to get taller.** The lid's
top fades out so a flat skin plate has no visible edge. Written as
`offset 0.34` in objectBoundingBox units, that fade was 34% of *whatever height
the plate happened to be* — and when the plate grew from 88 to 112 to cover the
eye, the faded band grew with it and stopped covering the top of the shut eye.
Sized in **pixels** (`gradientUnits="userSpaceOnUse"`, `y2="30"`) the height
becomes a free variable and the coverage becomes a stated one: 106 − 30 = 76
opaque pixels above the lash, against a 70-unit eye.

**The brows read as a scowl for two iterations and the brows were not the
problem.** Two eyes whose upper lash is heaviest at the *inner* corner read as
angry no matter what shape the brow above them is. The fix was in `EYE`: a light
stroke over the whole arc plus a heavy one over the **outer** half, and one lash
tick at the outer corner instead of both. ⇒ On a face, expression lives in ink
weight before it lives in shape.

**Seven art iterations before a rig existed, and that was the right order.** The
face was drawn, composited at its intended placements and looked at seven times
— brows, hair silhouette, bang depth, neck length, garment mass, choker,
proportions — before any of it was a `rig.json`. Building the rig first would
have meant re-deriving 30 numbers every time the head plate's width changed, and
the head plate's width is `R`.

**An unevenly spaced grid is the whole idea and it cost nothing.** The
temptation with a 5-column mesh is to space the columns evenly. Putting them at
`±162, ±120, 0` — dense at the silhouette, sparse in the middle — is the same 25
vertices sampling the part of the projection that actually moves. It is one
decision made once, in the setup geometry, and every deform key after it is
better for free.

**A plain `groups` entry bought almost nothing, and that is structural.** The
gallery's usual lever for cutting track count is a `groups` entry keying several
bones **identically**. In `turn` every part needs a *different* number by
construction — that is what parallax means — so of the original 20 tracks exactly
one was a group (`axis`, for the nose and mouth, both on the axis and therefore
both `cos t`), plus the two reciprocal groups the iris fix needs.

⇒ **What cut the track count was a group entry that stops keying identically**
([#295](https://github.com/rig-c/core/issues/295)): **8 tracks, 33 keys, 2
deform entries, 8 deform keys, 0 hand-written vertex offsets** for one held yaw,
against 20 and 81 before it.

🚨 **And the figure that matters more than either count: the hand-written numbers
barely moved.** The 20-track spelling stated **32** residuals and scale factors
across its held keys; this one states **34** depths, of which **11 are distinct**.
The saving is not arithmetic — it is that `brow_r at depth 158` is a claim a
reader can argue with and `1.14` is one they can only take on trust.
[FINDINGS.md](FINDINGS.md) is mostly about the 160 floats that came before both
constructs, and it is the record of what they cost while they were still being
paid.
