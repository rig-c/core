# squash — a deform timeline, and where its numbers come from

Rigby's ball bounces. The ball is a **mesh**, and its shape over the cycle is a
**deform timeline**: stretched along its travel while it is fast, squashed about
its contact point for the 0.12 s it is on the ground, round at the apex where it
is momentarily still. Rigby flinches and blinks when it lands.

⭐ **The one feature this example stars: `deform`.**
[AUTHORING §4.11](../../docs/AUTHORING.md) — the only timeline keyed on a
skin / slot / attachment triple, and the only one whose keys are a run of vertex
offsets rather than a value. Everything else is the ordinary recipe of
[MOTION.md](../../docs/MOTION.md): the bounce arc, the contact shadow, the
recoil, the follow-through.

🆕 **And the two shapes are now IN the spec rather than beside it.** This
README always wrote them out as two affine transforms, because that is where the
36 offsets came from; since
[#294](https://github.com/rig-c/core/issues/294) the keys **state** them
([AUTHORING §4.11.1](../../docs/AUTHORING.md)) and the compiler evaluates them.
The emitted numbers agree with the hand-written table this example shipped to
**0.0004 px** — identical at the three decimals below, the difference being that
the table was rounded to three places and the compiler quantises to six.

```
bun install                                     # once

bun cli.ts build   --rig gallery/squash/rig.json \
                   --motion gallery/squash/motion.json \
                   --out gallery/squash/build
bun cli.ts render  --candidate gallery/squash/build --fps 25 --max 288 \
                   --out gallery/squash/render
bun cli.ts preview --candidate gallery/squash/build --out gallery/squash/preview.html

# does the cycle close on the pose it opened with? `--duration` is the animation's own
# length out of motion.json; the tool refuses the reading when the set's last frame is
# not at it, which is every rate `0.8 x fps` is not a whole number at (issue #337).
bun gallery/loop_seam.ts gallery/squash/render/bounce@25fps --duration 0.8

# re-draw the 16 part PNGs. Needs rsvg-convert; the PNGs are committed, so this
# is for changing the art or checking that the committed bytes are the ones the
# script draws.
bun gallery/squash/make_parts.ts
```

`build`, `render` and `preview` write into this directory and are **not
committed** — the specs and the part PNGs are, and those three commands
regenerate the rest. The frame to look at is
`gallery/squash/render/bounce@25fps/f0010.png`: that is the impact.

---

## The mesh

Nine vertices and eight triangles — a fan, with the rim first and the centre last:

```
      2                     vertices 0..7 : the rim, counter-clockwise from 0°
   3     1                  vertex  8     : the centre
 4    8    0                triangles     : 8,k,k+1 around the fan
   5     7                  hull          : 8  (the rim IS the hull, so it
      6                                      comes first — Spine's convention)
```

**Unweighted, on purpose.** `vertices.length === uvs.length`, so the parser reads
x/y pairs and the runtime poses the whole mesh from the slot's bone. Two reasons,
and the second is the one that matters for a `deform` example:

- There is nothing to weight. One bone moves this ball; a weighted mesh binding
  every vertex to that one bone at weight 1 would be the same picture with a
  bone-influence array in front of it.
- **On an unweighted attachment the deform array is one `x, y` per vertex, in
  vertex order** ([§4.11](../../docs/AUTHORING.md)), so a reader can count the 18
  numbers `explain` prints against the diagram above. It is also the reason a
  `transform` key can be evaluated here at all: the array has **one coordinate
  space**, the mesh's own. On a weighted attachment the array is indexed by bone
  *influence*, the offsets live in each bone's own bind space, and a multi-bone
  vertex cannot hold one x/y pair at all — so a model over it is refused by name
  ([§4.11.1](../../docs/AUTHORING.md)).

`A20_MESH_WEIGHTS_COHERENT` accepts it: an unweighted mesh is valid Spine
(spineboy ships two), and the requirement that a mesh be weighted at all is the
`rig-play` generator policy, not validity.

### 🚨 The rim is **not** on the silhouette, and this is the trap

```
R_BALL_INK = 94.5     where the ink outline ends
R_BALL_RIM = 110      where the rim vertices sit
```

Eight rim vertices form an **octagon**, and an octagon's *sides* pass
`R · cos(22.5°)` from its centre — 8% closer in than its own vertices. Texture
outside the triangles is not drawn, so a rim placed *on* the art's edge leaves the
outline inside the mesh along the eight spokes and outside it everywhere between
them. The ball renders as a flat teal disc with no line around it.

The inradius is what has to clear the art:

```
110 · cos(π/8) = 101.63   >   94.5 = R_BALL_INK      ✔
 99 · cos(π/8) =  91.46   <   96.5                   ✘  ← the first version
```

Measured by the metric the `contour` generator already applies to itself — the
emitted triangles rasterised back over the part's own alpha — the first version
covered **94.31%** of the art and the corrected one covers **100.00%**. That
measurement is now on the `MESH` line for authored geometry too, which is
[issue #277](https://github.com/rig-c/core/issues/277), **fixed**:

```
MESH  ball         authored 9 vertices / 8 triangles  (budget 8)  bones=[ball]  attachments=[ball]  covers 100.00% of the art, reaching 15.00px past it
```

A `contour` under 99.5% is still refused by name and an authored mesh is still
not — rigc did not draw it, and a mesh that deliberately sits inside its art is a
real thing to author — so what changed is that the number is printed and the
decision is the author's. The first version would have said `covers 94.31%` in
its very first build.

The uvs are round numbers because the part is 240×240 and the rim is 110:
`(120 ± 110) / 240` is `0.0416667` and `0.958333`, and the diagonal
`110/√2 = 77.782` gives `0.175908` / `0.824092`.

---

## ⭐ The deform timeline

Five keys, and the two shapes between them are each **one affine transform of the
setup geometry**. That is what makes every number in the spec checkable rather
than felt:

```
stretch   about the centre          sx = 0.88   sy = 1.16
          dx = (sx − 1) · x = −0.12 · x
          dy = (sy − 1) · y =  0.16 · y

squash    about the contact point (0, −110)     sx = 1.20   sy = 0.74
          dx = (sx − 1) · x        =  0.20 · x
          dy = (sy − 1) · (y + 110) = −0.26 · (y + 110)
```

Vertex 6 is the rim's bottom, at local `(0, −110)`, so its squash offset is
`(0, 0)` — **the contact point is fixed by construction**. The ball flattens
against the ground rather than sinking through it, and there is no key anywhere
that has to be tuned to make that true.

⭐ **And those four lines of arithmetic are the spec** — the two `scale` pairs and
the one `about` point, with the compiler doing the multiplying:

```json
"deform": [
  { "slot": "ball", "attachment": "ball", "keys": [
      { "t": 0,    "ease": "gather" },                                                              // round: the apex
      { "t": 0.34, "transform": { "kind": "affine", "scale": [0.88, 1.16] }, "ease": "gather" },
      { "t": 0.4,  "transform": { "kind": "affine", "scale": [1.2, 0.74], "about": [0, -110] }, "ease": "charge" },
      { "t": 0.46, "transform": { "kind": "affine", "scale": [0.88, 1.16] }, "ease": "settle" },
      { "t": 0.8 } ] }                                                                              // round again
]
```

⇒ **The contact point is now a field rather than a consequence.** `about: [0,
-110]` is the line that used to be true of eighteen numbers and checkable only by
finding the pair that came out `(0, 0)`. `rigc explain` prints what it produced:

```
      t=0.4     deform[0..18]  9 pair(s)                       bezier[4]
               transform affine  scale=[1.2, 0.74] about=[0, -110]
               dx = (sx − 1)·(x − ax),   dy = (sy − 1)·(y − ay)
                 sx − 1 = 0.2
                 sy − 1 = -0.26
                 det = sx·sy = 0.888 > 0, so no triangle can reverse
               9 vertices, largest offset 57.2px at vertex 2
                 v  0 (22, -28.6)  v  1 (15.5564, -48.82332)  v  2 (0, -57.2)  v  3 (-15.5564, -48.82332)
                 v  4 (-22, -28.6)  v  5 (-15.5564, -8.37668)  v  6 (0, 0)  v  7 (15.5564, -8.37668)
                 v  8 (0, -28.6)
```

⭐ **`det > 0` is a proof rather than a report**, and it is the one thing this
kind buys that a table cannot: an affine map with a positive determinant
preserves every triangle's winding, so an `affine` key **cannot** be the fold
`A39_DEFORM_KEEPS_TRIANGLE_WINDING` hunts. rigc refuses a determinant at or below
zero for that reason — a mirror reverses all eight triangles at once.

Four things about that block are the format rather than a choice:

- **A key with no `vertices` or `transform` is the setup pose.** That is the
  format's own encoding for "undeformed", not a convention — which is why the
  first and last keys are bare, and why rigc refuses a `fromVertex` on such a key
  (there would be nothing for it to point at). A looping deform starts and ends
  exactly there.
- **The offsets are relative to the setup geometry**, in both encodings. Zero is
  "unmoved", and on an unweighted attachment the parser adds the setup vertex back
  on load.
- **The curve eases the blend, not a coordinate.** A deform timeline has exactly
  one channel and it runs 0..1 — the fraction of the way from this key's geometry
  to the next one's. So `gather` into the squash is what makes the impact *arrive*
  fast, and `charge` out of it is what makes it leave fast; the vertex numbers are
  unchanged by either.
- **The run must not overrun the array**, and this is the quietest defect in the
  animation half of the format: `arrayCopy` past the end of a `Float32Array` is a
  no-op in JavaScript, so one pair too many loses its tail and deforms the rest
  correctly. `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` measures the array's length off
  the attachment and checks it on the emitted file.

### The timing

`bounce`, 0.8 s, apex on the seam, impact at 0.4. The squash occupies 0.34 → 0.46
— **15% of the cycle**, which is what makes it read as a hit rather than as a
pose. [MOTION.md §3.3](../../docs/MOTION.md) puts a movement that happens *to*
something at 0.1–0.3 s; 0.12 s is the bottom of that band, and a bounce contact is
the fastest thing in this example.

The arc is [§3.5](../../docs/MOTION.md) and [§3.4](../../docs/MOTION.md) together:
the ball's fall is **three keys on a `translatey` track**, not a sampled parabola.
`gather` off the apex accelerates the fall and `charge` off the contact decelerates
the rise, so the shape of the arc is in the easing table rather than in the key
count.

`translatey`, not `translate`: the ball moves on one axis, and Spine keys the two
axes as separate timelines. A paired `translate` whose x channel happens to be
flat is a different file, with a different timeline count, and a different thing
for a runtime to blend against ([§4.4](../../docs/AUTHORING.md)).

### The rest of the cast

| Track | What it is for |
| --- | --- |
| `shadow` `scale` + `shadow` slot `rgba` | the cast shadow: small and faint at the apex, wide and dark at the contact. It is its own part, because the plate can only bake the shadow of something that stands still |
| `chest` `translate` | Rigby's recoil — 6 units down at **0.44**, 4 hundredths *after* the impact, then a 1.5-unit overshoot at 0.64 and settle ([§3.7](../../docs/MOTION.md), [§3.8](../../docs/MOTION.md)) |
| `eyes` slot `attachment` | the flinch-blink: `eyes_shut` for 0.08 s from the impact |
| `ears` `rotate` (a group), `head` `rotate`, `tail` `rotate` | follow-through at **+25% / +20% / +30%** of the cycle |

The blink's key time is `0.399999`, not `0.4`, and that is
[§4.5](../../docs/AUTHORING.md)'s rule rather than a typo: an attachment timeline
is **stepped**, a player reaches sample *i* by accumulating `1/fps` *i* times,
and for `i/fps` values already on the microsecond grid that accumulation lands a
few ULPs *below* the key. One grid step early cannot reach the previous sample —
40 000 µs away at 25 fps — and is always seen by the sample it was written for.
At `0.4` the blink would have missed frame 10, which is the impact frame.

---

## What was verified

| | |
| --- | --- |
| `rigc build --profile spine` | green — the run's own verdict is quoted below the table, and `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` is among the rules it measured |
| `rigc build --profile rig-play` | green as well — same, including `A13_MESH_BUDGET` against this rig's declared `invariants.meshTriangles: 8` |
| the deformed geometry, measured | the mesh's rim box is **220.0 × 220.0** at the apex and **264.0 × 162.8** at the impact — exactly `1.20 × 220` and `0.74 × 220`, so the affine transform in the spec is the one that reaches the screen |
| the transform against the table it replaced | all **54** emitted deform numbers of the three keyed shapes compared against the hand-written run this example shipped: worst difference **0.0004 px**, i.e. identical at three decimals ([#294](https://github.com/rig-c/core/issues/294)) |
| the contact point | rim vertex 6 sits at world y **44.0** at the impact and 44.0 in the setup pose — unmoved, as its `(0, 0)` offset says |
| mesh coverage | the emitted triangles cover **100.00%** of the ball's 28 020 art pixels (94.31% before the rim was moved out) |
| `rigc render` | 21 frames at 25 fps, contact sheet **looked at** twice — the first pass had a squash flat enough to read as a pancake and a ball with its outline eaten by the mesh |
| loop seam | **at `--max 288`**, which is 288×261 here: **0 / 255** max channel difference, 0 pixels differing of 75 168, at 25 fps (21 frames) — `0.8 × 25 = 20` is whole, so the last frame is at the duration and this is a seam reading ([#337](https://github.com/rig-c/core/issues/337)). The last frame is the first frame to the byte. 📏 The `--max` is part of the figure: a seam reading is scale-relative and a zero at one size is not a zero at every size ([#336](https://github.com/rig-c/core/issues/336)) |
| `rigc preview` | boots in the official Spine Web Player 4.3 and draws (headless chromium, no console or page errors) |
| `bun run selftest` | includes `GALLERY_EXAMPLE_IS_GREEN[squash]` |
| part determinism | `make_parts.ts` twice ⇒ identical bytes for all 16 PNGs |
| `bun run typecheck` / `lint` | green |

**The two verdicts, verbatim** — the report's last rule line and the summary under
it. Quoted rather than paraphrased, so the selftest's transcript gate re-runs both
commands and compares them line for line: the figures here are read off the run
instead of being kept by hand
([#609](https://github.com/rig-c/core/issues/609)).

`rigc build`:

```
PROF  A30_STROKE_WITHIN_CAP_CONTAINMENT: archetype rule, not in profile "spine"
..    51 assertions: 17 measured (17 passed, 0 failed), 19 skipped, 15 not in profile "spine"
```

`rigc build --profile rig-play`:

```
SKIP  A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS: the rig "squash" declares no axes (invariants.axes)
..    51 assertions: 23 measured (23 passed, 0 failed), 28 skipped, 0 not in profile "rig-play"
```

---

## What this cost — the authoring notes

**A mesh that clipped its own art was green, and a `contour` of the same art was
refused.** [Issue #277](https://github.com/rig-c/core/issues/277), **fixed**.
The numbers are in *The rim is not on the silhouette* above: 94.31% coverage, 18
assertions passed, nothing said. The generator that builds its own geometry
measures the result against the mask it came from and refuses under 99.5%;
authored geometry got the counts and no measurement at all. It now gets the same
measurement — a report rather than a bar — and this example's octagon is the
selftest's `CT08` fixture, at 90% with its rim on the silhouette against 100%
with the rim an octagon's apothem outside it. What found it in the first place
was looking at a 1:1 render and noticing the ball had no line around it.

**An eight-vertex rim is enough, and I expected it not to be.** The worry was
faceting: eight chords around a circle leaves 7.5 units of sag, and a squashed
disc looked like it would read as an octagon. At 1:1 it does not — the *texture*
is what the eye follows, the silhouette's chords are inside the outline's own
width, and the seams and highlight deform convincingly. That is why this example
carries 18 numbers per key instead of 34: a reader can count nine vertices
against a diagram.

**Look at a render at 1:1 before trusting a contact sheet.** The missing outline
was invisible at the 0.45× a contact sheet uses — it read as a slightly soft
edge — and unmistakable at full size. The sheet is for *whether the motion reads*;
1:1 is for *whether the drawing arrived*.

**The squash strength is bounded by what reads as a ball.** The first candidate
used `sy = 0.66`, which is a 2.3:1 pancake at the impact and stops reading as the
same object. `0.74` with `sx = 1.20` — a little under volume-preserving, which is
the classic cheat — keeps it a ball that got hit.
