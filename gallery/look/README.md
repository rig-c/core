# look — a head that turns because a *value* says so

Vela's head follows a number. Not a timeline: a **`slider` constraint** reads a
driving bone, maps its rotation to a time in an animation called `turn`, and
applies that animation there. Move the number and the face moves. The animation
this example renders drives the **dials**, not the face — which is the whole
point, because a face following a value that merely happens to be animated here
would follow the same value from a pointer, a gaze tracker or a game state.

⭐ **The one feature this example stars: `slider` constraints
([AUTHORING §3.5.2](../../docs/AUTHORING.md), [§4.12](../../docs/AUTHORING.md)).**
[`portrait`](../portrait/) is the closest relative and the contrast is the
lesson: same character, same 2.5D construction, and its 12° turn is **on a
timeline**. This one is **on an axis**, and everything downstream of that
changes — the keys are linear, there is no anticipation, and the shaping lives
in whatever moves the dial.

It is also where six things measured in the week of 2026-09-05 first stand up
together: a **depth map** giving every mesh vertex its own `z`
([#383](https://github.com/rig-c/core/issues/383)), the **`grid`** generator
([#386](https://github.com/rig-c/core/issues/386)), the reported **turn
ceiling** that the slider's range is derived from
([#393](https://github.com/rig-c/core/issues/393)), a **painted soft mask**
answering an impact ([#391](https://github.com/rig-c/core/issues/391)),
`A39` reading a slot's **alpha** so a part can fade out past its own ceiling
([#404](https://github.com/rig-c/core/issues/404)), and `A40` on **two
sliders sharing a bone** ([#405](https://github.com/rig-c/core/issues/405)).
The seventh arrived because of this example rather than before it: `A39` posing a
slider-applied animation **at the slider's own mapping**
([#407](https://github.com/rig-c/core/issues/407)), which is what lets the two
above run on one rig.

⚠️ **The art is generated, like every gallery example's** — Vela is drawn in
SVG by [`../portrait/make_parts.ts`](../portrait/make_parts.ts) and imported
here, and the three depth sheets are written from a closed form by
[`make_parts.ts`](make_parts.ts). Nothing below is a claim about how a
photograph, a painting or a normal-mapped render turns. That question is open
and this example does not touch it.

✅ **The editor round trip has been taken, on this example.** This paragraph said
it was *unverified* and the answer *unknown* until
[`tools/editor_roundtrip.ts`](../../tools/editor_roundtrip.ts) was run on a
licensed editor (data version 4.3.26) against a 4.3.13 build of this rig. The
premise it rested on is still true — no editor export in `examples/` carries a
slider — but the answer no longer depends on one. What came back
([FACE §8](../../docs/FACE.md)):

- ✅ **The parameter axis survives.** Both sliders return, `additive`, `local`,
  `bone`, `property`, `from`, `max` and `scale` identical field for field, and the
  two keep their places in the `constraints` array. `mix: 1` and `to: 0` are
  dropped, and those are the format's own defaults — an elision, not a loss.
- ⚠️ **The animation each slider *names* did not, until rigc changed its emit.**
  The editor re-keys the `animations` object and a slider's animation is an
  ordinal in the format's binary half, so `yaw -> "turn"` came back
  `yaw -> "sweep"` ([#535](https://github.com/rig-c/core/issues/535)). rigc now
  emits animations in the editor's order; on the same rig through the same editor
  that restored `yaw -> "turn"` and took the re-rendered mean absolute error from
  10.4655 / 8.4961 / 8.7140 to 0.3035 / 0.0769 / 0.0588.
- 🚨 **The cowlick stopped, and the bone was the reason.** Its physics constraint
  drives `rotate` on `ahoge_whip`, which was emitted with no length, and the
  editor's export drops a physics constraint's `rotate`, `scaleX` and `shearX`
  **only on a zero-length bone** — on any bone with a length all three come back
  (measured on Spine 4.3.23 and 4.3.26,
  [#1196](https://github.com/rig-c/core/issues/1196); #540 had read the same
  loss as *"the editor holds `x` and `y` only"*). So the export stated *drives
  nothing* and `A23_PHYSICS_CONSTRAINT_EFFECTIVE` refused it by name
  ([#536](https://github.com/rig-c/core/issues/536)). ⇒ With `ahoge_whip`
  given a length ([#1195](https://github.com/rig-c/core/issues/1195)), the
  cowlick survives the round trip.

```
bun install                                     # once

bun cli.ts build   --rig gallery/look/rig.json \
                   --motion gallery/look/motion.json \
                   --out gallery/look/build
bun cli.ts render  --candidate gallery/look/build --fps 25 --max 640 \
                   --out gallery/look/render
bun cli.ts preview --candidate gallery/look/build \
                   --out gallery/look/preview.html

# the one loop here. 3.2 x 25 = 80 is whole, so the last frame lands on the
# wrap point and the reading is a reading (issue #337).
bun gallery/loop_seam.ts gallery/look/render/sweep@25fps --duration 3.2

# re-draw the 24 part PNGs, the three depth sheets and the soft mask. The
# character half needs rsvg-convert; the sheets need nothing.
bun gallery/look/make_parts.ts
```

`build`, `render` and `preview` write into this directory and are **not
committed**. The frames to look at:

| Frame | What it is |
| --- | --- |
| `render/sweep@25fps/f0020.png` | the dial is held at **+19°** and the face is with it. **Look at this one at 1:1** — the contact sheet cannot tell a turn from a slide |
| `render/sweep@25fps/f0000.png` | the neutral, for the comparison. The pair is the example |
| `render/sweep@25fps/f0060.png` | **−19°**, the other end. The far sidelock has swapped sides |
| `render/turn@25fps/contact.png` | the axis itself, played straight: seven poses from −19° to +19°, with both needles sitting at zero because nothing is driving them. ⚠️ **The sidelock crossfade is not visible here** — see below |

---

## The mechanism, in one paragraph

`rig.json` declares two slider constraints. Each names a driving bone, a
property on it, and an affine map from that property's value to a time:

```json
{ "name": "yaw",  "type": "slider", "animation": "turn",
  "bone": "yaw_dial",  "property": "rotate",
  "from": -19, "to": 0, "scale": 0.05, "max": 19,
  "local": true, "additive": true, "mix": 1 }
```

`time = to + (value − from) × scale`, so the dial at −19° applies `turn` at
`0 + (−19 + 19) × 0.05 = 0 s`, at 0° applies it at `0.95 s` and at +19° at
`1.9 s` — which is exactly the animation's length. **0.05 s per degree**, on
both axes; `tilt` runs −5°..+5° and is therefore 0.5 s long. `0.05` is its own
float's shortest name, which is how rigc emits every number, so the file states
exactly `0.05` and nothing rounds the endpoint past the duration (AUTHORING
§3.5.2's last warning).

`motion.json`'s `sweep` keys `yaw_dial.rotate` and `tilt_dial.rotate`, the two
needles are attached to those bones, and the head follows. Nothing anywhere
keys the face.

---

## ⭐ The range is the measured ceiling, and here is the arithmetic

The face is a `grid` mesh with a **depth map**: 21 columns × 9 rows over the
340 × 380 head plate, and every one of the 189 vertices reads its own `z` off
`parts/face_depth.png`. A `yaw` deform key then projects with the same closed
form `portrait` uses, `dx = x·(cos t − 1) − z·sin t`, except that `z` is now
per-vertex instead of a cylinder radius.

**`build` reports the largest turn that geometry admits before a triangle turns
inside out**, from `tan t = A₀/A_yaw` on the mesh's own triangles
([AUTHORING §3.4](../../docs/AUTHORING.md)):

```
  MESH  head         grid     189 vertices / 320 triangles  (budget 320)  bones=[head]  attachments=[head]
        depth "face_depth.png" bf156ea0cfc970a3 near=white zScale=194 z=[0, 194]
        80 of 189 vertices sample a texel the part image does not draw — their z is the sheet's reading of somewhere the part is not
        turn ceiling  yaw +19.32° / -19.32°   pitch +22.92° / -26.94°
          1st pct     yaw +19.32° x1.000 of 80 / -19.32° x1.000 of 80   pitch +22.92° x1.000 of 102 / -26.94° x1.000 of 130
                      first to fold: yaw + at 19.32°, triangle 174 [119,138,139], the sheet steps 28.50 level(s) across it, which is 0.112 of the range this mesh sampled
```

⇒ **The range is the largest whole degree strictly inside that ceiling: 19.**
That is the whole derivation, and it is a rule rather than a taste — the ceiling
is where a triangle reaches exactly zero area and `A39` refuses, so the range
has to stop below it, and "below it" on a whole-degree grid is `floor(19.32)`.
Everything else falls out:

| | |
| --- | --- |
| reported ceiling, face mesh | **±19.32°** |
| slider range | **−19°..+19°** = `from: -19`, `max: 19` |
| seconds per degree | **0.05** (chosen; it is its own float's name, so `scale` is emitted exactly) |
| `turn`'s duration | `2 × 19 × 0.05` = **1.9 s** |
| the map | `time = 0 + (degrees + 19) × 0.05` |
| key times | 0, 0.3, 0.65, 0.95, 1.25, 1.6, 1.9 — the seven angles −19, −13, −6, 0, 6, 13, 19 |

🔸 **The other two figures in that block are about the sheet rather than the
angle**, and both say this one is a form. `which is 0.112 of the range this mesh
sampled` is the step across the folding triangle divided by everything the map
said across the whole mesh: a bounded slope halves that every time you double
the lattice, while a **discontinuity** — the cliff an estimated depth map puts at
every occlusion edge — pins it near 1 and halves the *angle* instead
([AUTHORING §3.4](../../docs/AUTHORING.md)). And `80 of 189 vertices sample a
texel the part image does not draw` is the lattice's own border: a `grid` spans
the whole part window and a head is not a rectangle, so 80 of these vertices take
their `z` from `face_depth.png` out past the silhouette. That is a count and not
a complaint — read it next to the 0.112.

📐 **How close 19° is to the wall is worth reading**, because it is the number
that says the derivation is not decorative. `rigc explain`'s `DEFORM` block at
the extreme key:

```
  DEFORM  turn  default/head/head  key 6  t=1.900000  transform yaw  depth=true degrees=19
          frame      applied by slider "yaw" off yaw_dial.rotate (local), dial 19.000000 -> t=1.900000
          moved      187 of 189 vertices, worst 63.1602px at v141
          area       min x0.016691 tri 215   max x1.874351 tri 225   (320 triangles, 0 with no area at the cleared pose, band 0.149321px²)
          stretch    max x1.879584 tri 225   min x0.016410 tri 215
          winding    320 of 320 kept, 0 collapsed
```

The worst triangle is down to **1.67% of its area** and still the right way
round. One more degree and it is not. (The two vertices that do not move are the
centre column's top and bottom, where the sheet is at `z = 0` and `x = 0`, so
both terms of `dx` vanish — a small check that the sheet is being read where it
is supposed to be.)

🚨 **And the ceiling is not a quality bar.** It says when the mesh folds, not
when the drawing stops reading. [FACE §8](../../docs/FACE.md) measured the other
limit on `portrait`'s construction and found the eye sockets giving out at
~26° — a `scaleX` cannot rotate an almond. At ±19° the sockets here read
**0.777588** on the far side and **1.113449** on the near one (`rigc explain`'s
`MEMBER` block), and 0.778 is far enough that the far iris (outer radius 28.5)
is very slightly wider than the white it sits in (opening half-width
36 × 0.778 = **28.0**). That is [FACE §8](../../docs/FACE.md)'s Failure 2
arriving, visible only at the two extreme frames, and it is left in rather than
tuned away: the point of running the range to the ceiling is that the reader can
see the two numbers are different ones.

### Why the sheet has the ceiling it has

🚨 **The depth sheets are generated from a closed form, and the form is a
raised cosine, because the fold angle is a property of the SHEET and not of the
mesh.** [FACE §2.2](../../docs/FACE.md) measures both shapes over a 1,300×
range of lattice densities:

| lattice | 5×5 | 17×17 | 33×33 | 65×65 | 129×129 | 181×181 |
| --- | --- | --- | --- | --- | --- | --- |
| **dome**, largest turn admitted | 62° | 41° | 31° | 23° | 17° | **14°** |
| **raised cosine**, slope bounded | 73° | 65° | 64° | 64° | 64° | **63°** |

A dome is *vertical at its rim*, so `tan t_max = 1 / max|dz/du|` goes to zero as
the lattice gets fine enough to find that slope; a bounded slope holds its angle
at every density. So `make_parts.ts` builds the face sheet out of two bounded
pieces and states each one's slope:

| piece | what it says | steepest slope |
| --- | --- | --- |
| the skull | 150 units deep, **flat across the middle 80 px** and reaching its floor at ±152 — 2.5 px *inside* the drawing's own ink outline at ±154.5 | `150π / (2 × 112)` = **2.10** ⇒ 25.4° |
| the nose ridge | 44 more units, over a ridge **44 px across**, running from the brow to below the mouth | `44π / (2 × 22)` = **3.14** ⇒ 17.7° |

⭐ **So the nose is what sets a face's turn ceiling**, and the reported 19.32° is
the lattice's own reading of that ridge — a little above the analytic 17.7°,
because 21 columns sample the ridge with 5–6 px spacing and a secant is never
quite the tangent. Flattening the nose would buy angle and spend the one depth
cue that survives foreshortening. Letting the skull reach its floor *before* the
outline is the other half, and it is the edit [FACE §2.2](../../docs/FACE.md)
names as the one that rescues a sheet traced off a render.

⚠️ **What a depth map still is not: a measurement.** `zScale` — 194 here, which
is `SKULL_Z + NOSE_Z` exactly — is authored. Eight bits of level say nothing
about world units, so getting it wrong scales the whole parallax with every gate
still green.

### The bone depths are read off the same sheet

`portrait` had to invent a depth per feature, because a cylinder radius is one
number and a face is not one number. Here `make_parts.ts` prints the sheet at
each feature bone's own position, and `motion.json` states that value plus one
stated stand-off:

```
the face sheet, sampled at each feature bone (head-local x, y -> z):
  faceshift  (   0,    0)  z = 168.18
  eye_l      ( -62,  -15)  z = 136.17
  eye_r      (  62,  -15)  z = 136.17
  brow_l     ( -62,   36)  z = 136.17
  brow_r     (  62,   36)  z = 136.17
  nose       (   0,  -64)  z = 191.42
  mouth      (   0, -106)  z = 142.57
  forehead   (   0,  100)  z = 137.21   <- what "bang" reads, plus its own stand-off
```

| member | sheet says | stand-off, and why | `depth` in `motion.json` |
| --- | --- | --- | --- |
| `eye_l`, `eye_r`, `iris_?`, `spark_?` | 136.17 | **−16**: a socket is a hollow, and the eyeball, its pupil and the highlight on it are one object at one depth | **120.2** |
| `brow_l`, `brow_r` | 136.17 | **+8**: a brow sits proud of its socket | **144.2** |
| `nose` | 191.42 | **0**: the ridge *is* the nose | **191.4** |
| `mouth` | 142.57 | **−4**: almost on the surface | **138.6** |
| `faceshift` (`carried`) | 168.18 | 0 | **168.2** |
| `bang` (the fringe) | 137.21 at the **forehead**, not 66.13 at its own bone | **+26**: the fringe's stand-off in front of the skull | **163.2** |
| `hairmass` | — | a decision: the back hair's centroid is 55 **behind** the axis | **−55** |
| `ahoge` | — | a decision: the cowlick sits almost on the axis | **20** |

🩹 **`neck` is the fudge, and it is labelled as one, exactly as `portrait`'s
is.** A neck twists — its top follows the head and its base hardly at all — and
one rigid plate can only take an average. Here the average is written as a
*reduced depth*: `depth: 84.1` is `0.50 × 168.2`, so the neck takes half the
head's shift and the arithmetic is the same closed form as everything else. The
**0.50 is not derived**; it is the value at which the chin stopped hanging off
the throat at 19°. `portrait` needed 28% at 12°, and [FACE §8](../../docs/FACE.md)
predicted that a turn reading at 20° would need the neck to be **its own mesh
with its own columns**. That prediction is coming due and this example does not
answer it: what it does is turn the fudge up from 0.28 to 0.50, which is a
bigger fudge and not a better construction. The right fix is a meshed neck.

🚨 **The fringe's row is a defect this example made and fixed, and it is worth
the sentence.** The first version sampled the sheet at the fringe *bone*, at
`y = 137`, where the plate is already curving away and reads 66.13. The fringe
then travelled 24 px less than the face under it and visibly slid across the
forehead at both extremes — a wrong number, a green gate, and the only thing
that caught it was looking at `f0020.png` at 1:1. What the plate is doing *under
the fringe* is the forehead, so that is the sample.

---

## 🚨 The far sidelock folds, and it is off the screen when it does

Each sidelock is its own `grid` mesh with its own sheet, and the sheet is
**asymmetric on purpose**. A strand hanging beside the face is a tube seen from
the front: its outer edge is the silhouette, where the surface curves away over
a few pixels, and its inner edge blends into the cheek behind it over the rest
of the plate. So the crest sits 18 px in from the outer edge and the two halves
are two different cosines — 42 units over 18 px on the outside, 42 over 66 on
the inside — and the ceiling comes back asymmetric:

```
  MESH  hair_lock_l  grid     39 vertices / 48 triangles  (budget 320)  bones=[lock_l]  attachments=[hair_lock_l]
        depth "lock_l_depth.png" 0c4eaeb36b7c5cac near=white zScale=64 z=[22.086275, 63.87451]
        32 of 39 vertices sample a texel the part image does not draw — their z is the sheet's reading of somewhere the part is not
        turn ceiling  yaw +17.04° / -45.80°   pitch +none / -none
          1st pct     yaw +unranked of 12 / -unranked of 36   pitch +none / -none
                      first to fold: yaw + at 17.04°, triangle 2 [1,28,29], the sheet steps 78.00 level(s) across it, which is 0.468 of the range this mesh sampled
```

⭐ **And the side it folds on is the side the head has turned it away from.** A
yaw swaps two neighbouring vertices when `tan t ≥ du/dz`, which happens at
*positive* t where depth increases with `u` and at negative t where it
decreases. On the viewer's-left lock the steep outer edge is on the left, depth
rises rightward across it, and it folds at **+17.04°** — the direction in which
that lock has swung behind the jaw. `hair_lock_r` reports the mirror,
**−17.04°**. Neither is a coincidence to be grateful for; it is the sheet saying
the same thing as the drawing.

`pitch +none / -none` is not a large number, it is the absence of one: these
sheets vary along `u` only, and a depth that is constant along an axis cannot
fold the other one at *any* angle.

**17.04° is inside the ±19° range, so both locks must be gone before the turn
gets there** — which is the third of AUTHORING §3.4's three ways to live with a
ceiling, and the one a face actually uses. The fade is `rgba` keys **inside
`turn`**:

```json
{ "slot": "hair_lock_l", "property": "rgba", "keys": [
    { "t": 0,    "v": [1, 1, 1, 1] },
    { "t": 1.25, "v": [1, 1, 1, 1] },
    { "t": 1.6,  "v": [1, 1, 1, 0] },
    { "t": 1.9,  "v": [1, 1, 1, 0] } ] }
```

⚠️ **It cannot be a second slider, and that is a fact about the format rather
than a preference.** A slot-colour timeline **ignores the additive argument
entirely** (AUTHORING §3.5.2's second warning), so two sliders keying one slot's
colour overwrite each other whatever their flags say. The fade belongs inside
the one animation one slider applies.

🚨 **The alpha-0 key lands at +13°, one key BEFORE the +19° key that folds**
([#403](https://github.com/rig-c/core/issues/403)). `A39` measures keys and
the runtime interpolates between them, so a fade that finished *on* the folding
key would leave every frame just before it drawn, nearly folded and unmeasured.
13° is inside 17.04°, so the key that is still visible is also still sound, and
the run above it is at alpha exactly 0 the whole way:

```
  DEFORM  turn  default/hair_lock_l/hair_lock_l  key 5  t=1.600000  transform yaw  depth=true degrees=13
          frame      applied by slider "yaw" off yaw_dial.rotate (local), dial 13.000000 -> t=1.600000
          skipped    A39 reads no winding off this key: the slot's alpha is exactly 0 at this time (slot 0.0000 x attachment 1.0000), so this key draws no pixels — a triangle that draws no pixels cannot draw them backwards
          moved      39 of 39 vertices, worst 13.8048px at v23
          area       min x0.240410 tri 3   max x1.193150 tri 12   (48 triangles, 0 with no area at the cleared pose, band 0.115973px²)
          stretch    max x1.193150 tri 37   min x0.240410 tri 3
          winding    48 of 48 kept, 0 collapsed
  DEFORM  turn  default/hair_lock_l/hair_lock_l  key 6  t=1.900000  transform yaw  depth=true degrees=19
          frame      applied by slider "yaw" off yaw_dial.rotate (local), dial 19.000000 -> t=1.900000
          skipped    A39 reads no winding off this key: the slot's alpha is exactly 0 at this time (slot 0.0000 x attachment 1.0000), so this key draws no pixels — a triangle that draws no pixels cannot draw them backwards
          moved      39 of 39 vertices, worst 19.5969px at v30
          area       min x-0.116728 tri 27   max x1.262153 tri 13   (48 triangles, 0 with no area at the cleared pose, band 0.115567px²)
          stretch    max x1.262153 tri 13   min x0.073931 tri 25
          winding    44 of 48 kept, 0 collapsed  <- a fold, and nothing gates it: this key draws no pixels (see above)
```

⭐ The `frame` line is the point of
[#407](https://github.com/rig-c/core/issues/407) (see below): `turn` is applied
by the slider, so `A39` measures it with the dial where the mapping puts it rather
than on a track — which is what lets those alpha-0 keys BE alpha 0 at the moment
they are read.

and the stats line says so on a green run too, which is the half that keeps the
exemption from being silence:

```
deformKeysMeasured=17 deformTrianglesMeasured=2720 deformFrames=turn:slider/yaw deformKeysNotDrawn=4
deformNotDrawn=turn/hair_lock_l/hair_lock_l#5:alpha0,turn/hair_lock_l/hair_lock_l#6:alpha0,turn/hair_lock_r/hair_lock_r#0:alpha0,turn/hair_lock_r/hair_lock_r#1:alpha0
deformNotDrawnReversed=8
```

📏 **Measured on the frames, not just in the gate.** Counting the lock's own
pixels in a box below where the back hair's strands end, over a **5 fps** `turn`
ladder at `--max 880` (10 frames, so the last sample is at 1.8 s = +17°):

| frame | angle | left box | right box |
| --- | --- | --- | --- |
| `f0000` | −19° | 80 | **0** |
| `f0002` | −11° | 112 | **0** |
| `f0004` | −3° | 151 | 177 |
| `f0007` | +9° | 173 | 121 |
| `f0009` | +17° | **0** | 88 |

⚠️ **That reading is from before [#407](https://github.com/rig-c/core/issues/407)
and `render/turn` no longer reproduces it** — the sliders are live at setup now, so
playing `turn` on a track holds both locks at alpha 1 and the zeros above are gone
from that set (measured: the whole difference between the two builds' `turn` frames
is those two slots, above). The crossfade itself has not moved — `sweep`'s frames
are byte-identical across the change and the gate reads the same four alpha-0 keys
— and `render/sweep@25fps` is where it is now visible on frames. **The box count
has not been re-taken there**; the numbers above stand as the reading that was
made, of a frame set that has changed under them.

---

## Two axes, and what `additive` is for

`tilt` is the second slider: −5°..+5° of head roll on `headroll`, which is the
**same bone** `turn` rolls. That shared target is the whole reason both sliders
declare `additive: true`.

📐 **Measured on this rig**, by posing the artifact through `spine-core` with
the two dials held at their extremes and reading `headroll.appliedPose.rotation`:

| | `headroll` rotation |
| --- | ---: |
| yaw dial at +19°, tilt dial at 0° | 1.90° |
| yaw dial at 0°, tilt dial at +5° | 5.00° |
| both, both sliders `additive: true` | **6.90°** — the sum |
| both, with `tilt` at the parser's default `additive: false` | **5.00°** — the later slider alone |

That last row is the failure the flag prevents: a non-additive apply at mix 1
**writes the value outright**, so the slider later in the `constraints` array
wins and the earlier one contributes nothing. It is the same arithmetic
AUTHORING §3.5.2 tabulates on a purpose-built probe (7.50 / 18.75 / 26.25), on
real geometry.

🚨 **`local: true` on both, and this one *is* a red build.** A `rotate`-driven
slider reading a **world** rotation goes through `FromRotate.value`, which ends
`if (value < 0) value += 360` — so a yaw axis neutral at 0° loses its whole
negative half. rigc refuses it at compile with the arithmetic in the message,
and here is that refusal on this rig, produced by flipping the flag:

**Reproduce it:** replace `"local": true` with `"local": false` in `gallery/look/rig.json`, then run `build`.
```
rigc compile error: rig constraint "yaw": drives off bone "yaw_dial" rotate with "local": false, and the
driving values that reach animation "turn" (0s..1.9s) run from -19.000° to 19.000°. A world rotation is read
through `FromRotate.value`, which ends `if (value < 0) value += 360`, so the bone at -19.000° is read as
341.000° and maps to time 18.000s. This dial reaches only 0.950s..1.900s of the animation's 1.9s, and 94.7% of
the circle — every reading above 19.000° — is held on the frame at 1.900s. The whole part of the range below
0° is dead and nothing at runtime reports it. Add `"local": true` to read the bone's own rotation signed and
unwrapped — that is the form a face axis wants — or move the range so it does not cross 0°. (see rigc guide CE_COMPILE_SLIDER_WORLD_ROTATION_DEAD_RANGE)
```

### ⭐ Both sliders are at `mix: 1`, and both `A39` and `A40` gate this rig

This was the one place where two of the constructs above were in tension, and it
is worth reading as a repaired defect rather than as a feature.

**The shape it shipped in first:** both sliders at `"mix": 0`, with `sweep`
switching them on through a `slider.<name>.mix` timeline — AUTHORING §4.12's
idiom for turning a constraint on from an animation. It was not a preference. A
slider at full authority applies its animation continuously, at whatever time its
bone currently points at, and the slot-colour half of that apply is an
*overwrite*. `A39` posed `turn` on a **track** to measure it, the yaw slider
simultaneously applied `turn` at the **neutral** time, and the alpha-0 key the
animation itself wrote was undone:

**No run reproduces this:** the shape this rig no longer has — both sliders at `"mix": 0` with `sweep` keying them on — so no edit to the shipped spec prints it; abridged at the ellipsis besides
```
FAIL  A39_DEFORM_KEEPS_TRIANGLE_WINDING: animation "turn" deform hair_lock_l/hair_lock_l key 6
(t=1.899999976158142s): 4 of 48 triangle(s) reverse winding — triangle 2 [1,28,29] 540.000 -> -63.033px² …
```

— with no alpha named in the message, because the alpha it found was 1. Muting at
setup bought that back, and it cost `A40`, which correctly excludes a slider below
full authority: the composition this example is *about* was verified by
measurement and not by the gate.

🚨 **[#407](https://github.com/rig-c/core/issues/407) is that the frame was
wrong, not the alpha rule.** `turn` is never played on a track — the dial selects
its time, so **the key's time and the applied time are the same number by
construction**, and A39 was measuring the two independently. It now inverts the
slider's own mapping and drives `yaw_dial` to the value that selects each key's
time (AUTHORING §4.11.4), which is the frame a playthrough actually contains:

**No run reproduces this:** abridged — the `skipped` line is cut at the ellipsis; it is quoted in full above
```
  DEFORM  turn  default/hair_lock_l/hair_lock_l  key 6  t=1.900000  transform yaw  depth=true degrees=19
          frame      applied by slider "yaw" off yaw_dial.rotate (local), dial 19.000000 -> t=1.900000
          skipped    A39 reads no winding off this key: the slot's alpha is exactly 0 at this time …
```

⇒ **both sliders declare `"mix": 1`, `sweep` keys no `mix` at all, and both
assertions run:**

**No run reproduces this:** two verdict lines lifted out of one `--profile rig-play` run, which does not print them adjacent
```
  PASS  A39_DEFORM_KEEPS_TRIANGLE_WINDING
  PASS  A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET
```

The 6.90° below is still read off the posed artifact, but it is no longer the only
thing standing behind the composition.

📏 **What that does to the rendered frames, measured** (both builds rendered at
5 fps / `--max 320` and compared with `rigc check`):

| set | reading |
| --- | --- |
| `sweep` | **MAE 0.00** — byte-identical. The mix timeline keyed 1 from `t=0`, so nothing about the animation you actually play has moved |
| `tilt` | every committed frame byte-identical |
| `turn` | **MAE 0.52** (worst 1.08 at `f0000`), and `check` attributes **100% of it to `lock_l` (45.3%) and `lock_r` (54.7%)** with every other chain at 0.0% and slot drift ≤ 0.2 px — i.e. no geometry moved at all |

⚠️ **That last row is the one to understand rather than to fix.** `turn` played
straight on a track is not a thing this rig does in use — it is the slider's lookup
table — and with the sliders live, playing it means the yaw slider is *also*
applying `turn`, at its neutral `0.95 s`. The pose there is the neutral, so nothing
moves; but the slot-colour half of that apply is an overwrite, so **both sidelocks
are held at alpha 1** and the crossfade the animation writes is invisible in
`render/turn`. It is visible in `render/sweep`, where the dial is what moves —
which is the frame the gate now measures too.

⚠️ **One cost, stated:** removing the two `slider.<name>.mix` tracks left this rig
with **no constraint timeline at all**, so `A34_CONSTRAINT_TIMELINE_TARGETS` now
reports SKIP here (*"no animation carries a constraint timeline"*) where it used to
pass. It is the same assertion list either way; a rig that keys one is what exercises
that rule, and six other gallery examples do.

---

## The cowlick answers a stop

The cowlick is the fourth mesh, and the only one with no depth map. It carries a
**painted soft mask** instead: `parts/ahoge_soft.png` is white at the tip, black
at the base, with the handover painted across the middle third, and `build`
reports what reached the mesh:

```
  MESH  ahoge        grid     35 vertices / 48 triangles  (budget 320)  bones=[ahoge, ahoge_whip]  attachments=[ahoge]
        soft "ahoge_soft.png" b51d0ed788f2a040 -> ahoge_whip, 10 carried / 10 in the falloff
  PHYS  whip         bone=ahoge_whip     components=[rotate] mix=1  <- drives a mesh: its canvas re-rasterises while the spring settles
```

⭐ **Painted, and the falloff painted too, because softness and prominence are
different properties of a drawing.** rigc tried a depth threshold for one day
and it was wrong in the most instructive way: the most prominent thing on a face
is the nose, and a nose does not wobble
([AUTHORING §3.4](../../docs/AUTHORING.md)).

📏 **What the spring buys, measured** — the cowlick's tip against a control
build with the same rig and `inertia: 0`, tracked over the 81 frames of `sweep`
at `--max 640`: **2.78 px** of horizontal lag at worst, at `f0040`. The tip is
the top-right vertex of the `ahoge` mesh in `render --geometry`'s
`geometry.json` (vertex 4, the highest at rest), and the lag is the difference
of its world `x` between the two builds times the frames' 0.673401 px per unit.
That is the whole claim; it is a small part and a small impulse.

📐 **`ahoge_whip` has a `length`, and the number is measured rather than
chosen** ([#1195](https://github.com/rig-c/core/issues/1195)). A physics
constraint driving `rotate` steps off the bone's tip, `length` along its own x
axis, so a bone with no length has no tip — and with nothing to aim at, the
solver aims the bone at world angle 0, which `A23_PHYSICS_CONSTRAINT_EFFECTIVE`
now refuses by name. The figure is the strand's extent along that axis: the mesh
window is the plate (100 × 130) centred on `ahoge`, so the bone's origin at
`(-16, -55)` is crop pixel `(34, 120)`; its world x axis is +x (no bone above it
turns, setup matrix `[1 0; 0 1]`), and the drawing's last opaque column that
`ahoge_soft.png` hands to it at all is column 99, whose far edge is crop `x` 100
— **100 − 34 = 66**. The fully carried pixels and every opaque pixel read the
same 66, because the strand runs to the plate's right edge. The reading that was
**not** taken is the chord to the strand's tip (129.3 to the farthest carried
pixel centre): it is a length along a direction the bone does not point in.

What the length changed, through rigc's own poser at 60 fps against the same
rig with physics off, the largest |rotation| of `ahoge_whip` and the offset at
the animation's end:

| `ahoge_whip` length | `turn` | `tilt` | `sweep` |
| ---: | --- | --- | --- |
| 0 (before #1195) | 3.390° / 3.390° | 4.652° / 4.576° | **173.810° / 27.600°** |
| **66** | 0.204° / −0.178° | 1.562° / −1.562° | **1.940° / −0.667°** |

With no length the strand spun nearly half a turn in `sweep` and the tip lagged
88.03 px at `f0057` by the measure above — which is also why the 7.24 px this
paragraph used to state is not reproduced by it.

🗒️ **A soft mesh could not also take a turn key when this example was built**,
which is why the cowlick has no depth sheet and the face has no mask — a carried
vertex has two bones, and a `transform` key was refused on any attachment that
did. [#389](https://github.com/rig-c/core/issues/389) removed that: the model
is now evaluated at each vertex's setup world position and pushed into every
influence through that bone's own inverse, and
[`SF03`](../../selftest.ts) measures the combination rather than the refusal.
This example has not been rebuilt around it, and its skeleton is byte-identical
either way — the two things it separates are still on separate parts because
that is how it was authored, not because the tool requires it.

---

## `turn` is not an animation you play

Three animations, and only one of them is for watching.

| Animation | Duration | What it is |
| --- | --- | --- |
| `turn` | 1.9 s | the yaw slider's **lookup table** over −19°..+19° |
| `tilt` | 0.5 s | the tilt slider's, over −5°..+5° |
| `sweep` | 3.2 s, `loop: true` | the only one meant to be played: it turns the two needles and switches the sliders on |

⭐ **Every key in `turn` and `tilt` is linear — there is no `ease` anywhere in
either.** A slider-applied animation is indexed by a *value*, so an easing curve
would make the pose a non-linear function of the dial: the face would lag and
overshoot a number the consumer is holding perfectly still. For the same reason
there is **no anticipation and no follow-through** in `turn`, though
[MOTION.md §3.6](../../docs/MOTION.md) asks for both — they are functions of
time, and this is a function of a value. All of the shaping is in `sweep`, where
the needles hold at each extreme with `rise`/`settle`/`swell` on the way.

⚠️ **Rendering `turn` directly is a diagnostic, not a shot.** With the sliders
muted at setup it plays clean — that is what `render/turn@25fps/contact.png` is,
seven poses on one axis with both needles at zero. Turn the mix up and play it
on a track at the same time and you get the animation *twice*, because the
slider is still applying it at wherever the dial points.

---

## The rest of the rig

**24 parts, 30 bones, 24 slots, 4 meshes**, and Vela is
[`portrait`](../portrait/)'s drawing imported rather than redrawn — the
gallery's rule is one drawing per character, `portrait` already defended her as
a second cast member, and a third face here would be a third character for no
reason. The parts list is a subset of hers: no lids, because nothing blinks.

| Split | Why |
| --- | --- |
| `iris_?` and `spark_?` are children of **`faceshift`**, not of `eye_?` | ⭐ and this is where the construction differs from `portrait`'s. There, the iris inherited the socket's `scaleX` and a circle under `scaleX 0.89` is an ellipse, so two reciprocal tracks had to undo it. Here the pupil is simply **not parented into the thing that foreshortens**: the socket narrows, the pupil does not, and the reciprocal is not needed at all — [FACE §5](../../docs/FACE.md)'s finding with the fix moved into the skeleton |
| `sockets` is a second group beside `features` | `features` (10 members) takes the parallax; `sockets` (6) takes the `scaleX`. The irises are in the first and not the second, which is the sentence above as data |
| `ahoge` sits at the cowlick's **plate centre** with `ahoge_whip` at its base | a mesh has no attachment offset — its window is centred on the slot bone — so the offset `portrait` writes on the attachment becomes a bone position here, and the spring bone goes where the strand actually hinges, with a `length` of 66 — the strand's measured extent along its axis, which a `rotate` spring steps off (see *The cowlick answers a stop*) |
| `yaw_gauge` / `yaw_dial` (and the tilt pair) | the gauge face is on a still bone and only the needle bone turns, so the printed scale cannot rotate with the value it is measuring |

**The gauge faces are marked from `rig.json`'s own slider ranges.**
`make_parts.ts` reads each constraint's `from` and `max` and puts the end ticks
there; a dial marked with one range beside a constraint that maps another would
be two internally consistent files disagreeing, which is the defect
[`../stage.ts`](../stage.ts) exists to prevent for bone positions.

🚨 **The needle's direction is the other half of that.** SVG is y-down and a
Spine bone's positive rotation is counter-clockwise in a y-up world, so a needle
at +19° points up and to the **left**. The tick angles are mirrored in
`make_parts.ts` for exactly that reason — the first version was not, and the
gauge read backwards while both files stayed self-consistent.

---

## What was verified

| Claim | How | Reading |
| --- | --- | --- |
| builds green under the default `spine` profile | `rigc build` | the run's own verdict, quoted below the table |
| builds green under `rig-play` too | `--profile rig-play` | the same, and `A13`, `A14`, `A15`, `A21`, `A39` are among the rules only that profile runs |
| the selftest's gallery suite gates it under **both** | `bun run selftest` | `GALLERY_EXAMPLE_IS_GREEN[look/spine]`, `[look/rig-play]` |
| deterministic | `A18`, plus the suite compiling it three times | byte-identical |
| the far lock folds and draws nothing when it does | `A39` + the stats line | 4 keys not drawn, 8 reversed triangles among them, 17 keys still measured |
| `turn` is measured in the frame the slider puts it in | `A39` + the `DEFORM` block | `deformFrames=turn:slider/yaw`, and each key line names the dial value its mapping inverts to |
| the two sliders compose | posed through `spine-core`, **and gated** | 1.90 + 5.00 = **6.90°** on `headroll`; `A40` PASSes since [#407](https://github.com/rig-c/core/issues/407) let both sliders sit at `mix: 1` |
| the `local: false` refusal fires on this rig | flipping the flag and building | refused at compile, message quoted above |
| `sweep` closes on its opening pose | `loop_seam.ts --duration 3.2` at `--max 640` | **160 / 255**, 565 px of 375 040 — see below |
| …with the spring inert | the same, on a control build with `inertia: 0` | **1 / 255**, 1 px |
| the cowlick's spring does something | the same control, tracking the tip | 2.78 px of lag at `f0040` |
| it looks like a turn and not a slide | looking at `f0000` / `f0020` / `f0060` at 1:1, twice, plus both contact sheets | the far socket narrows to 0.778 while the near one widens, the mesh's own bands run ×0.017 to ×1.87 across the plate, the back hair swings the **other** way, and the far lock leaves |

**The two verdicts, verbatim** — the report's last rule line and the summary under
it. Quoted rather than paraphrased, so the selftest's transcript gate re-runs both
commands and compares them line for line: the figures here are read off the run
instead of being kept by hand
([#609](https://github.com/rig-c/core/issues/609)).

`rigc build`:

```
PROF  A30_STROKE_WITHIN_CAP_CONTAINMENT: archetype rule, not in profile "spine"
..    51 assertions: 22 measured (22 passed, 0 failed), 14 skipped, 15 not in profile "spine"
```

`rigc build --profile rig-play`:

```
SKIP  A30_STROKE_WITHIN_CAP_CONTAINMENT: the manifest declares no `stroke.cap_containment_ceiling`, so this cut has no measured containment ceiling
..    51 assertions: 29 measured (29 passed, 0 failed), 22 skipped, 0 not in profile "rig-play"
```

🚨 **The loop does not close, and the reason is the spring, not the timeline.**
`loop_seam.ts` reads **160 / 255** over 565 pixels, worst at `(321, 45)` — the
cowlick's tip (169 / 255 over 941 pixels, worst at `(311, 41)`, before
`ahoge_whip` had a length — [#1195](https://github.com/rig-c/core/issues/1195)). A physics constraint's state is not a function of time: the first
frame is rendered from `Physics.reset` and the last carries 3.2 s of accumulated
motion. The control makes that exact: the same cycle with `inertia: 0` reads
**1 / 255** at one pixel, so the *keyed* pose closes and what does not is the
spring. 📏 Both figures are readings at `--max 640`
([#336](https://github.com/rig-c/core/issues/336)); re-measure before
carrying either to another size.

## What was NOT verified

- ⚠️ **Not the Spine editor round trip — that one moved.** This bullet said
  nothing here showed the editor preserves two sliders, their flags or their array
  order; the round trip at the top of this page now shows exactly that, and shows
  the cowlick's physics `rotate` being dropped on the same trip
  ([#544](https://github.com/rig-c/core/issues/544) is the card for both
  statements having stood side by side). What is still unverified is narrower and
  is not about this rig: no editor export **in this repository** carries a slider
  at all, so `A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET`'s "could correct editor
  output trip this?" question rests on the runtime's own arithmetic rather than on
  a counter-example anybody holds. `src/validate.ts` states that beside the rule.
- ⚠️ **`A34_CONSTRAINT_TIMELINE_TARGETS` SKIPs here** (see above): with the two
  `slider.<name>.mix` tracks gone this rig keys no constraint timeline at all, so
  that rule has nothing to look at on this example.
- ⚠️ **Nothing here says a depth map works on real art.** Three generated
  sheets, one generated face. The convergence result
  ([FACE §2.1](../../docs/FACE.md)) is about a mesh approaching its own sheet's
  model, not about a sheet approaching a photograph.
- ⚠️ **The `0.50` neck fraction and every stand-off in the depth table are
  decisions**, not measurements. So is `zScale`. They are all written down where
  the turn uses them, which is the most this construction can offer.

## What the authoring cost

- **The fringe read the sheet in the wrong place** (above): a green build, a
  plausible number, and a visible slide that only a 1:1 frame showed.
- **The gauge was drawn mirrored**: SVG's y-down against Spine's
  counter-clockwise, so `+19` was printed on the side the needle never reaches.
  Neither file was wrong on its own.
- **`A39`'s alpha exemption and `A40` could not both run on one rig** when this
  example was first built (above). Found by hitting it: the first build with both
  sliders at `mix: 1` was red on `A39`, at an alpha the animation had keyed to 0.
  It shipped muted at setup, the tension went to
  [#407](https://github.com/rig-c/core/issues/407) as an issue, and the answer
  turned out to be that **A39 was posing the wrong frame** — not that either rule
  was too strict. This README is the before and after of that.
- **A slider-applied animation is a lookup table and wants linear keys.** Not a
  defect — a thing that is obvious afterwards and was not before, and the
  reason `turn` looks so unlike `portrait`'s.
