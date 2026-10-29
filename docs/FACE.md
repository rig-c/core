# Authoring a face — a turn, a gaze and a blink on plain Spine data

**Read this when the request is a head rather than a body.** It is written for an
agent that has been handed a drawn face — or has to draw one — and asked for the
moves a portrait makes: it breathes, it blinks, its eyes move, and it **turns a
few degrees off axis**. The last one is the reason this page exists. It is the
move a second format is usually bought for, and it is authorable here, out of an
ordinary `deform` timeline plus per-part parallax, at a cost this page prices
before you spend it.

[AUTHORING.md](AUTHORING.md) is the format — read it first and keep it open; this
page never restates a field it documents, and
[AUTHORING §4.11](AUTHORING.md) is the `deform` timeline field by field.
[MOTION.md](MOTION.md) is the recipe for
*movement* — timing, easing, anticipation, follow-through, the offset table — and
everything in it applies to a face unchanged. This page is the part neither has:
**a face's own geometry**, and what a projection costs when the spec can only
hold its results.

- The `deform` timeline, field by field, and the six things rigc refuses in it:
  **AUTHORING §4.11**
- Named failures, and the file each one points at: **AUTHORING §5–§6** — the
  refusals this page names are read there, and §4.2 quotes the one that points
  back at this page
- Timing, easing, arcs, anticipation, follow-through, the per-bone offset table:
  **MOTION §3** — a blink and a gaze are ordinary MOTION.md work
- Candidate spreading and the ballot: **MOTION §4–§5**. Nothing on this page
  replaces a person's eye
- A skeleton somebody else authored, and moving a pivot inside it:
  [INGEST.md](INGEST.md)
- The hierarchy underneath a face, as a general rule rather than this closed form:
  [RIGGING.md](RIGGING.md) — §5 is why §3's `faceshift` is a bone at all and why a
  breath's `chest` is a **sibling** of the plate it must not scale, and §4.4 is the
  artless-parent pattern the shared-shift split is one instance of
- The worked example every number below comes from:
  [`gallery/portrait`](https://github.com/rig-c/core/tree/main/gallery/portrait),
  and its measurement half,
  [`FINDINGS.md`](https://github.com/rig-c/core/tree/main/gallery/portrait/FINDINGS.md)
- **The same closed forms on the other axis**:
  [`gallery/nod`](https://github.com/rig-c/core/tree/main/gallery/nod) is a
  worked `pitch`, and this page stays written for a **yaw**. It re-derives §4.2's
  fold angle on uneven *rows* and brackets it against `A39` at 33°/34°, and it
  measures §5's foreshortening at **0.863–1.176** against the yaw's 0.892–1.064
  below — a wider span at the same 12°, because a face is taller than it is deep.
  Read it after this page, not instead of it
- **The turn driven by a value instead of played as a time** — the same keys, on
  an axis: §8's *The turn as a value rather than a time* derives the range,
  **AUTHORING §3.5.2** is the `slider` constraint that does it, and
  [`gallery/look`](https://github.com/rig-c/core/tree/main/gallery/look) is
  the worked case. Read it when the angle has to follow something outside the
  animation — a pointer, a gaze target, a game value

🚨 **A `deform` key's winding is gated; how far it moved the geometry is not, and
that half is the one you have to author around.**
`A39_DEFORM_KEEPS_TRIANGLE_WINDING` refuses a key that turns the mesh inside out —
by name, by key and by triangle — and the build writes nothing. What no assertion
has an opinion about is **magnitude**: a band that stretches where the projection
says it should compress keeps every triangle's winding, so it gates green, beside
the same `MESH` coverage line as the good build, because coverage reports the
*setup* pose. §9.2 is that pair as three builds of one rig — the good one, one
wrong and green, one refused. For the half still ungated, `explain`'s `DEFORM`
block prints each key's area and stretch ratios per triangle with no reference
render (§9.2, AUTHORING §4.11.2), and §9.3 is the differential audit, the three
things it cannot do, and the procedure that survives them.

📐 **Where the numbers on this page come from.** Every figure marked **derived**
is re-computed from the closed form in §1 and reproduces to the digits printed.
Every figure marked **measured** was read off the shipped artifact by the
`gallery/portrait` record and carries its scope in the line. Nothing here is a
prediction, and nothing here is a pass bar.

---

## 0. The normal form

**A face request normalises to a depth list plus MOTION.md.** That is the whole
internal shape:

| What arrived | What it becomes |
| --- | --- |
| a face that **blinks**, **breathes**, **looks around** | ordinary MOTION.md tracks. A lid, a chest, an iris. Nothing on this page is needed |
| a face that **turns** | a list of `(x, z)` — every part's position across the screen and its **depth** — plus one line of arithmetic evaluated at each of them |
| a face that turns **far** (a three-quarter view) | ⛔ a different rig, and §8 says where the line is. Not a format problem: a parts-and-labour problem |
| a face that turns **by however much something outside it says** — a pointer, a gaze target, a game value | the same list and the same arithmetic, reached by a **value** instead of by a playhead: the turn animation becomes a `slider`'s lookup table (§8's last subsection, AUTHORING §3.5.2). What changes is not the geometry, it is the range — which stops being a choice and becomes a measurement |

⭐ **The turn is the only part of a face that is not already MOTION.md's job**,
and it is 90% of this page. A blink is a translating plate (§6); a gaze is
MOTION §3.7's offset table applied to an eye (§7). If the request does not
contain a turn, read §6 and §7 and stop.

The one thing that is genuinely new: a turn is **not a pose you can key**. It is
a projection, so its values are not chosen, they are *evaluated* — and the
authoring is transcription rather than judgement. Which means the failure mode is
not "it reads badly", it is **"one number is wrong and nothing can see it"**.
That is what §3 and §9 are for.

---

## 1. The one line, and that it **is** one line

Treat the face as painted on a cylinder standing on the skull's vertical axis. A
yaw of `t` about that axis carries a point at `(x, z)` — `x` across the screen,
`z` toward the viewer — to `x·cos t − z·sin t`, so the shift a part takes is

```
dx = x·(cos t − 1)  −  z·sin t
     \____________/    \______/
      the head           depth times sin t:
      narrowing to       the WHOLE of the move
      cos t of its
      width (2.2% at 12°)
```

**That is the entire model.** Everything else on this page is that expression
evaluated somewhere, and the two terms are worth reading separately:

- **`−z·sin t` is proportional to depth.** A part further forward travels
  further. That *is* parallax, and it is why a fringe moves more than a face and
  why hair behind the axis moves the **other way** (§2).
- **`x·(cos t − 1)` pulls both edges inward by the same amount** — the head
  narrowing. It is second order and it is small: at 12° it is 2.2%, which is 3.5
  units at the silhouette against a 35-unit centre shift.

At the 12° the worked example ships (**derived**):

```
t = 0.209440 rad      cos t − 1 = −0.021852      sin t = 0.207912
```

⇒ **A reader who has this line derives every number in a turn and never reaches
for a hand-tuned table.** That matters more than it sounds: a hand-tuned face
table has no property you can check, and a derived one has exactly one — it
agrees with the line, or it does not.

### 1.1 ⭐ And now the spec holds the line, not its results

**A `deform` key states this expression** (AUTHORING §4.11.1). The worked
example's held 12° yaw is four lines of which two are the angle:

```json
{ "t": 0.62, "transform": { "kind": "yaw", "radius": 170, "degrees": 12 }, "ease": "swell" },
{ "t": 1.5,  "transform": { "kind": "yaw", "radius": 170, "degrees": 12 }, "ease": "settle" }
```

⇒ **`radius` is `R` off the depth table (§2) and `degrees` is the angle.** The
compiler evaluates `dx = x·(cos t − 1) − z·sin t` at every vertex with
`z = √(R² − x²)`, writes the millimetre-level results into the artifact, and
`explain` prints both the model and the offsets it produced. What the key
states is a measurement of the shape the drawing implies, and nothing else.

Three things follow, and they are the reasons the construct exists rather than
side effects:

- **A second angle is a second number.** Each angle of §8's cliff sweep — 8, 12,
  16, 20, 24, 28 and 32 degrees — is `"degrees": <n>` and a rebuild.
- **A small yaw is one key.** The anticipation MOTION §3.6 asks for and the
  head-follow §7 prices are each one key with a smaller `degrees`.
- **The audit is two parameters.** A transcription can only be checked against the
  line by hand, which is §9.3's gap; a stated model is checked by reading two
  parameters. What is still unmeasured is the *consequence* — whether that angle
  folds the mesh — and §4.2 and A39 are that half.

⚠️ **What it does not do.** It evaluates; it never chooses. The radius, the
angle, the depth table and whether 12° reads are all yours, and a wrong `radius`
produces 160 consistent wrong numbers at once — see §4's warning, which the
construct makes cheaper to get wrong rather than harder.

📌 **Author `t` in degrees, in the spec.** Radians appear nowhere: the key holds
the angle and the compiler holds the conversion.

---

## 2. Depth is the parameter you are actually authoring

🚨 **A part list for a face is not a list of drawings. It is a list of
`(x, z)`.** The bones carry `x` (`eye_l` at `−62`, `nose` at `0`) and the rig
carries the mesh columns' `x`; the `z` is in no drawing.

⭐ **Every depth goes in the file, and each half has its own construct.** A `yaw`
deform key states its `radius` (§1.1), which is the `R` of the cylinder that plate
is painted on — so the head's 170 and the fringe's 196 are in `motion.json`. A
**bone** track's key can state a `derive` model over a group, whose `depth` is one
number **per member** — so the feature depths, the hair depths and the sign flip
below are in the file too (§3, AUTHORING §4.5.1). Neither is spelled `"z"`: the
field is `radius` on a mesh key and `depth` on a bone track.

⇒ **Write the depth table down somewhere a reader will find it.** The specs hold
the depths the turn *uses*; a project's own reasoning about them — why the fringe
stands off 26 and not 15 — belongs beside the rig, and in the worked example that
is a table in its README.

⚠️ **A depth is a decision.** The table below is the thing to argue about before
authoring anything, and the point of writing it into the spec is that a reader of
the numbers can see the table that produced them:

```bash
grep -c '"depth"' gallery/portrait/motion.json    # 8, one per derive key
```

**The depths in the worked example**, and what each one is doing (**derived**
column: `dx` at 12°):

| Part | `x` | `z` | `dx` | What the depth is |
| --- | --- | --- | --- | --- |
| face centre (skull surface) | 0 | **170** | −35.345 | `R`, the cylinder radius. Every other number is relative to this |
| fringe centre | 0 | **196** | −40.751 | 26 **in front** of the skull. The one number in the rig that exists only to make parallax |
| `nose` | 0 | **192** | −39.919 | protrudes 22. The only feature in front of the surface |
| `eye_l` / `eye_r` | ∓62 | 150 | −29.832 / −32.542 | 20 **below** the surface — a socket is a hollow |
| `brow_l` / `brow_r` | ∓62 | 158 | −31.495 / −34.205 | 12 below. A brow sits proud of its socket |
| `mouth` | 0 | 166 | −34.513 | 4 below. Almost on the surface |
| `hairmass` (back hair) | 0 | **−55** | **+11.435** | its centroid is 55 **behind** the axis |
| `lock_l` / `lock_r` | ∓150 | 100 | −17.513 / −24.069 | off-axis and shallow, so they travel about half as far as the centre |
| `ahoge` (cowlick) | −23 | 20 | −3.656 | almost on the axis, so it barely moves |

⭐ **The sign flip is the strongest single depth cue you can buy.** `hairmass` at
`z = −55` makes `−z·sin t` positive: as the face swings left, the back of the
head swings **right**. It is one track, one number, and it is what separates a
turn from a slide more than any mesh work does.

⚠️ **Get the depths right and the parallax is free; get one wrong and nothing
complains.** A depth is not measurable from the art — it is a decision about a
shape the drawing only implies. Two readings that help:

1. **Depth is what the drawing overlaps for.** A part drawn *over* another is
   usually in front of it, and the slot order already records that (AUTHORING R4).
   Depth is the same ordering with a magnitude attached, so **derive the sign from
   the draw order and argue only about the size.**
2. **The stand-off is the number to state out loud.** The fringe's 26 is not a
   measurement of anything; it is how much parallax the shot wanted. At 12° it
   buys `26·sin 12° = 5.406` units of extra travel — **derived**, and the record
   measured 5.406 on the artifact. If the fringe does not read as separate,
   this is the one number to move, and moving it moves nothing else.

### 2.1 One depth per part, and the limit of that

Everything above states **one depth per part** — a stand-off the whole plate
shares. That is the right resolution for a part list: the fringe is 26 in front
of the skull, and arguing about which *pixel* of the fringe is 26 would be
arguing past what the drawing says.

It stops being the right resolution the moment a part's own surface is the
subject. §4 meshes the face plate into columns precisely because the plate is not
flat, and §4.2 then finds that refining those columns makes the fold **worse**,
not better — the columns are sampling a cylinder that was never the shape of a
face. A cylinder is one number pretending to be a surface, and past a certain
density the pretence is what fails.

⭐ **Two things arrive together, and both are generated rather than written.**
[AUTHORING §3.4](AUTHORING.md#344-grid--a-lattice-over-the-part-window)'s `grid`
generator builds the lattice from the column positions alone, and reproduces this
example's hand-numbered 25 vertex pairs, 32 triangles and hull walk exactly. That
is the prerequisite: a turn needs interior vertices to move, and
§4.3's contour has none.

⭐ **And a depth map is the number above becoming a surface.** A greyscale sheet in the
part's own pixel grid gives every mesh vertex its own `z`, sampled where the
vertex actually is, and `yaw`/`pitch` project off it with the same closed form as
§1 — only the source of `z` changes. What it buys is stated where it is authored:
[AUTHORING §3.4](AUTHORING.md#345-depth--give-every-vertex-its-own-z-instead-of-one-cylinder-radius),
with the sampling order, the refusals and the one that matters most (a sheet cut
to the art covers **none** of a contour mesh's vertices, because they all sit on
the silhouette and outside it).

⭐ **And the mesh really is evaluating the pixels' model — measured, not
asserted.** A consumer that renders the same sheet in a shader displaces every
PIXEL by its own depth; a mesh displaces vertices and interpolates across
triangles. On a dome (a ramp would prove nothing — linear interpolation is exact
on a linear field) at 18°, the two evaluations converge as the lattice refines:

**No run reproduces this:** the 2026-09-05 density study's figures, printed by `bench/studies/2026-09-05-density/tools/densprobe.ts` and kept in its `evidence/`; no command this page states re-takes them

| lattice | 3×3 | 5×5 | 9×9 | 17×17 | 33×33 |
| --- | --- | --- | --- | --- | --- |
| mean disagreement, px | 6.4141 | 1.8452 | 0.5887 | 0.2276 | **0.0926** |
| the same lattice reading a **cylinder** instead | 3.8972 | 3.1628 | 3.2558 | 3.3429 | **3.3777** |

🚨 **Read the second row before the first.** A mesh evaluating the wrong surface
does not converge — it settles at ~3.4px however dense it gets — and at 3×3 it
reads *better* than the right one. So one measurement at one density cannot tell
the two models apart, and would have picked the wrong one. The claim is the
convergence, never a single number. (The worst
case falls more slowly than the mean and is expected to, because the dome's rim
has an unbounded depth gradient.)

⚠️ **This is not the same quantity as §4.2's fold angle, which refining makes
WORSE.** Both are true: a finer lattice buys fidelity to the model and costs the
angle at which a column pair inverts. This measures the first; `A39` refuses the
second.

⚠️ **It does not make depth measurable.** The map is relative — 8 bits of level
say nothing about world units — so `zScale` is authored exactly as the fringe's
26 was, and the two warnings above survive intact: get it right and the parallax
is free, get it wrong and nothing complains. What the map removes is the
*resolution* limit, not the judgement.

### 2.2 The angle belongs to the map, not to the mesh

§2.1 leaves an open question, and it is measured here. §4.2 finds that
refining the lattice makes the fold **worse**, and read that as the cylinder's
error surfacing — so per-vertex depth ought to have bought the angle back. ⛔ **It
does not, and it never could have.**

Two neighbouring vertices swap places when the turn tips one past the other,
which is `tan t ≥ Δu/Δz` — so the largest turn a part supports is

    tan t_max = 1 / max |dz/du|

**the reciprocal of the steepest slope anywhere in its depth map**, and there is
no mesh in that formula at all. Refining the lattice does not change the angle;
it changes which slopes the lattice is close enough to *find*. A map with a
vertical edge has an infinite slope there, so a fine enough mesh folds at any
angle you name.

⭐ **Which is exactly what a dome is.** `z = Z√(1 − r²)` is vertical at its rim,
and an even lattice over it folds at `tan t = √h·√(R/2)/Z` for spacing
`h = W/(side−1)` — a **√h** that goes to zero. Measured against that closed form
over a 1,300× range of vertex counts, agreeing to ≤ 1.2°:

**No run reproduces this:** the same 2026-09-05 density study, its `evidence/` and its harness; the closed-form rows are arithmetic and the measured rows are that run's

| lattice | 5×5 | 17×17 | 33×33 | 65×65 | 129×129 | 181×181 |
| --- | --- | --- | --- | --- | --- | --- |
| **dome**, largest turn admitted | 62° | 41° | 31° | 23° | 17° | **14°** |
| the closed form above | 59.0° | 39.8° | 30.5° | 22.6° | 16.4° | **14.0°** |
| **raised cosine**, slope bounded | 73° | 65° | 64° | 64° | 64° | **63°** |
| its closed form, `atan(2R/Zπ)` | 64.8° | 64.8° | 64.8° | 64.8° | 64.8° | **64.8°** |

⇒ **Author the map so its slope is bounded, and the angle stops depending on the
mesh.** A raised cosine — flat at the centre, flat again at the rim — holds
63–64° from 289 vertices to 32,761. The dome loses three quarters of its angle
over the same refinement. Both are "correct" depth; only one of them is a
*surface a turn can be built on*, and the difference is entirely in the input.

🚨 **So a map traced straight off a rendered normal or a photogrammetry pass is
the dome case, not the cosine case.** Where the part curves away to its
silhouette is where every such map goes vertical. Flattening it there — letting
z reach its floor *before* the outline rather than at it — is the edit that buys
the angle, and it is an edit to the sheet. rigc will not do it for you: the
compiler never invents a value that is not in the spec, and a depth map is a
measurement.

⚠️ **This does not touch §2.1's convergence.** A finer lattice still evaluates
the map's own surface more faithfully; it also finds steeper slopes in it. Those
are two different quantities and both are true — §2.1 measures the first, `A39`
refuses the second. What is new here is that the second is a fact about the
sheet, and can be fixed there.

⭐ **And you do not have to find the ceiling by building into it.** `build`
and `explain` print it for any mesh with a depth map — per axis, per direction,
naming the triangle that goes first — from `tan t = A₀/A_axis` on the mesh's own
geometry ([AUTHORING §3.4](AUTHORING.md)):

```
        turn ceiling  yaw +31.41° / -32.01°   pitch +32.01° / -31.41°
          1st pct     yaw +31.55° x1.004 of 1004 / -32.10° x1.003 of 1044   pitch +32.10° x1.003 of 1044 / -31.55° x1.004 of 1004
                      first to fold: yaw + at 31.41°, triangle 960 [113,112,593], the sheet steps 12.52 level(s) across it, which is 0.049 of the range this mesh sampled
```

Read it as a fact about **the sheet**. If the number is too small, the fix is in
the map — flatten it where the part curves away — and not in the lattice.

#### ⚠️ That rule presumes the map is continuous

"Flatten it where the part curves away" is an edit to a **surface**, and it
assumes there is one under the whole mesh. A depth sheet estimated from a
picture of cut-out art is not a surface: it is piecewise, with a **cliff at every
occlusion boundary** — figure against background at the silhouette, and one part
of the figure over another wherever they overlap. There is nothing to flatten
across a cliff, because the two sides are not two ends of a slope. They are two
different things at two different depths, and a 2.5D turn does not model
occlusion at all.

The ceiling reads the cliff, correctly, and the number it reports is real:
walked one degree at a time through the survey `A39` refuses from, a reported
1.936° admits +1° and reverses 8 triangles at +2°. **The rig genuinely folds at
two degrees.** What is wrong is not the instrument and not the mesh — it is that
the question "how far can this turn" has no answer for an input with a
discontinuity in it, and the ceiling proves it by halving with every doubling of
the lattice: measured tangent ratios 2.02 / 1.95 / 2.02, `tan t ∝ h` exactly,
with no limit to converge to.

🚨 **And the two figures beside the ceiling both call it healthy.** The 1st
percentile reads 1.02–2.17, which is a band reaching the limit together — and it
*is* a band, because an outline is long. The depth step reads 148–252 levels of
255, far above the quantisation floor — and the sheet really did say that much,
in one step. Divided by the range, the same number says the opposite: the step
share pins at **0.92–0.99** where rigc's own gallery reads 0.112 and 0.468.

⇒ Two ways out, and **neither of them is flattening**:

- **Mesh only what is continuous.** One face, one lock, one sleeve — a region
  the sheet describes without a jump in it — rather than a lattice over a whole
  figure. Whether a mask that tight gives a usable angle is not yet measured;
  the mask has to be painted rather than thresholded, for the reason `soft`
  is painted (§3.4's `soft` block).
- **State a sheet that was authored rather than estimated.** §2.2's raised
  cosine holds 63–64° from 289 vertices to 32,761 because somebody drew its
  slope. That is the input this whole section is about.

⛔ rigc will not decide that your sheet is the wrong kind of thing. It has every
authority to say what it measured, and the step share is that.

📐 Method, harness and the full ladders live in the repository rather than in
this package, as
[`bench/studies/2026-09-05-density`](https://github.com/rig-c/core/tree/main/bench/studies/2026-09-05-density) —
the same study also measures why `contour` is the wrong generator for a turn: it
saturates at 868 vertices however fine the tolerance, its vertices all sit on the
silhouette so it samples **2 %** of the depth range, and its ear-clipped interior
holds triangles three orders of magnitude apart in area, the smallest of which
reverse under a fraction of a pixel.

**No run reproduces this:** the ladder in the paragraph below is the 2026-09-05 noise study's, taken with `bench/studies/2026-09-05-noise/tools/noiseprobe.ts`, one evidence file per experiment; no command this page states re-takes it

🚨 **The sheet's grain is a slope too, and the ceiling reads it.** Because
`max|dz/du|` is a maximum over sampled gradients, there is no averaging anywhere
in it. On a sheet whose true ceiling is 64.77°, measured at 4,225 vertices:
**±1 level** of noise reports 61.37°, **±8 levels** reports 45.34°, and **one
stray pixel out of 160,000** reports 6.08° — and `A39` refuses at each of those
angles, so the rig is as damaged as the report says. Refining the lattice makes
every one of them worse. Two hard bounds follow, both independent of the form:
a sheet can never report above `atan(255·h / zScale)` for cell size `h`, and
below one texel per cell the answer saturates at the steepest adjacent-texel
step. ⇒ **Author the sheet so it changes by at least ~8 levels across one mesh
cell**, and spend its whole 0–255 range on the part — a map using an eighth of
the range describes the same surface and reports 5.8° less of it. Method and
ladders:
[`bench/studies/2026-09-05-noise`](https://github.com/rig-c/core/tree/main/bench/studies/2026-09-05-noise).

⭐ **And you do not have to guess which of the three you are looking at.** The
lines under the ceiling say it: the **1st percentile over
the ceiling** is near 1 when a band of the mesh reaches the limit together and
near 10 when one triangle does, which is a texel — 1.003 against 10.652 for the
two sheets above. The **depth step across the triangle that folds first**, in
levels, is the second: below about 3 the ceiling is quantisation, and at 1 it is
`atan(255·h / zScale)` and carries nothing about the form at all. The **same step
over the range the mesh sampled** is the third, and it is the one that separates
a steep surface from a cliff — a form's halves with every doubling of the lattice
while its angle settles, a discontinuity's does not move while its angle halves.
All three are reports and none of them moves the ceiling — ⛔ rigc will not filter
a depth map, because a smoothed measurement would describe a surface the deform
key is not built from and `A39` would go on refusing at the raw angle.
[AUTHORING §3.4](AUTHORING.md) has the reading table.

---

## 3. One shared shift, then residuals

⛔ **Do not key each feature's whole `dx`.** Put a bone at the face plate's own
origin, key the part every feature shares onto that one bone, and let each
feature key only what is left:

```
faceshift.translatex = −R·sin t                    ← −35.345 at 12°, R = 170

residual(x, z) = dx(x, z) − (−R·sin t)
               = x·(cos t − 1) + (R − z)·sin t
                                 \_______/
                                  the part's depth BELOW
                                  the skull surface
```

⭐ **So a feature's own track is nothing but its depth below the surface, times
`sin t`.** That is the sentence this page exists to produce.

**The features of the worked example** (**derived**, and every value matches the
shipped `motion.json` to the last digit printed there):

| Bone | `x` | `z` | `dx` | residual | `scalex` |
| --- | --- | --- | --- | --- | --- |
| `eye_l` (far) | −62 | 150 | −29.832 | **5.513** | 0.8922 |
| `eye_r` (near) | 62 | 150 | −32.542 | **2.803** | 1.0641 |
| `brow_l` | −62 | 158 | −31.495 | 3.850 | 0.8966 |
| `brow_r` | 62 | 158 | −34.205 | 1.140 | 1.0597 |
| `nose` | 0 | 192 | −39.919 | **−4.574** | 0.9781 |
| `mouth` | 0 | 166 | −34.513 | 0.832 | 0.9781 |

🚨 **The reason to do it this way is that it makes a wrong number visible.** A
residual is **1–6 units**; a total is **30–40**. Nobody can eyeball an error in
the second, and everybody can eyeball one in the first — a residual with the
wrong sign, or one an order of magnitude off its neighbours, is obvious in a
column of six. ⇒ **The shared-shift split is an auditing decision before it is a
rigging one**, and given §9 that is the whole argument for it.

### 3.1 ⭐ And now the spec holds this split, not its results

The pattern above is a
named construct rather than a page of advice: **one group track whose key states
the model, with a depth per member** (AUTHORING §4.5.1). The worked example's six
residuals and six scale factors are two tracks:

```json
{ "group": "features", "property": "translatex", "keys": [
    { "t": 0,    "v": [0], "ease": "rise" },
    { "t": 0.62, "derive": { "kind": "yaw", "degrees": 12, "carried": 170,
                             "depth": { "eye_l": 150, "eye_r": 150, "brow_l": 158,
                                        "brow_r": 158, "nose": 192, "mouth": 166 } },
      "ease": "swell" },
    { "t": 2.2,  "v": [0] } ] }
```

`carried` **is** the shared shift, stated: it is the depth whose `−R·sin t` the
`faceshift` bone already applies, so what each member keys is exactly the residual
this section derives. Drop it — write `carried: 0` or leave it out — and the same
kind emits the **full** `dx` instead, which is what the parts hanging off `head`
rather than off `faceshift` need. ⇒ **The split is the one parameter, and the seam falls where the parent chain already
put it** (AUTHORING §4.5.1 refuses a model over members under different parents,
for exactly that reason).

⭐ **`explain` then prints the column of six, which is what the argument above
asked for.** The `MEMBER` block (AUTHORING §4.5.2) is a row per member — the
emitted value, the `x` it read off the rig, and the depth the spec stated — so the
nose diagnostic below is a line you read rather than arithmetic you redo:

**No run reproduces this:** abridged — the five derivation lines the run prints between this record's head and its rows are cut; AUTHORING §4.5.2 quotes them
```
  MEMBER  turn  group "features".translatex  t=0.620000  6 member(s)  derive yaw  degrees=12 carried=170  -> the displacement
            eye_l       5.513083  <- -62 at depth 150
            eye_r       2.803385  <-  62 at depth 150
            brow_l      3.849789  <- -62 at depth 158
            brow_r      1.140092  <-  62 at depth 158
            nose       -4.574057  <-  0 at depth 192
            mouth       0.831647  <-  0 at depth 166
```

⭐ **The nose is the diagnostic.** It is the only **negative** residual on the
face, because it is the only feature in front of the surface: it protrudes 22, and
`22·sin 12° = 4.57` is exactly how much further left it goes than the cheek it
sits on (**derived**: −4.574). ⇒ **If the nose's residual is not negative, the
depths are wrong.** It is the cheapest check on this page and it is arithmetic,
not a render.

📌 **`faceshift` has to be its own bone, and not the head bone.** The head bone
is the head mesh's own slot bone, and the mesh deform already carries that
plate's motion; a translate there would move the plate **twice**. Make
`faceshift` a child of `head` that carries only the features — the worked
example's chain is `headroll → head → faceshift → {eyes, brows, nose, mouth}`,
which `rigc explain` prints as a parent column (§9.2).

⭐ **The same reasoning puts the head's pivot one link above the mesh.** A head
rotates about the top of the neck, not about the middle of its own face, so the
roll belongs on a `headroll` bone above `head`. There is a rule that enforces it
under `--profile rig-play`: `A15_IDLE_NO_MESH_BONE_KEYS` refuses an `idle` that
keys a bone driving a mesh — its own slot bone or its control bone — because that
renderer must never idle-skip a mesh. Keying the pivot one link up satisfies it,
and **the rig that satisfies the assertion is the better rig anyway.**

⚠️ **A15 assumes the meshes are mostly static, and that assumption is the rule's
whole premise.** The `@rig-c/play` renderer (the `rig-play` profile's player) skips
redrawing a mesh nothing moved, so a face whose `idle` breathes through one pivot
keeps every mesh under it cheap only if nothing keys the meshes' own bones. The rule reads bone **names**: keying `headroll`
passes it, and `head`'s mesh still moves, because a child's world transform is
composed from its parent's — so pivoting is right here for the anatomical reason
above, not because it stops a redraw. A **painting rig** is the genre where the
premise is false by design: one illustration in layers, most of them weighted
meshes, with an `idle` whose job is to move them. Pivoting every keyed bone one link
up there satisfies the wording and not the purpose (issue #855: 42 extra bones, the
same pose, the meshes still moving). That rig **declares** instead —
`invariants.idleDrivesMeshes: { "why": … }` ([AUTHORING](AUTHORING.md) §3.7) — and A15
reports the bones, meshes and vertices the `idle` moves as a SKIP rather than a
refusal per bone.

---

## 4. The mesh — where the columns go is the whole decision

Two meshes and **40 vertices** carried a head turn in the worked example, which
cuts against the expectation that a face mesh needs hundreds. The reason is
structural: **a yaw moves nothing vertically**, so the rows are along for the
ride and only the column count buys anything.

```
head       340 × 380 plate, R = 170        hair_bang   372 × 168 plate, R = 196
  5 columns × 5 rows = 25 vertices           5 columns × 3 rows = 15 vertices
  32 triangles                                16 triangles
  columns  x = −162, −120, 0, 120, 162      columns  x = −170, −120, 0, 120, 170
  rows     y = 180, 90, 0, −90, −180        rows     y = 80, 0, −80
  z = √(R² − x²)                            z = √(R² − x²)
```

Each column's offset is `dx` at its own `(x, z)`, and **every row gets the same
value**, so the run the compiler writes is one row of five repeated down the grid
with a `0` for every `y`:

```
-7.175, 0, -22.414, 0, -35.345, 0, -27.658, 0, -14.255, 0,   <- ×5 rows
```

⭐ **The spec states the model and the compiler writes that** (§1.1): the key is
`{ "kind": "yaw", "radius": 170, "degrees": 12 }`, and the 50 numbers above are
what `explain` prints and what lands in the artifact. The offsets are still worth
reading, because the *shape* of that row is §4.1's whole argument.

⚠️ **`R` is the radius of the cylinder a part is painted on, and it is not always
the plate's half-width.** For the head plate the two coincide (`340/2 = 170`). For
the fringe they do **not**: its plate is 372 wide (half-width 186) but its `R` is
**196**, because 196 is where the fringe *sits* — 26 in front of the skull. ⇒
Read `R` off the depth table, never off the PNG.

### 4.1 Uneven columns, and it costs nothing

🚨 **The columns are not evenly spaced, and that is the trick.** `−162, −120, 0,
120, 162` puts them **dense near the silhouette and sparse in the middle**, which
is the sampling a cosine needs: the centre of the face travels `R·sin t` and the
edges barely travel at all, so all the *variation* is at the edges. Five evenly
spaced columns spend their resolution where nothing happens.

What the grid then does to the drawing is a **non-uniform horizontal
redistribution** (**derived** at 12°, widest row):

| Band, from the far edge | Rest width | At 12° | Ratio |
| --- | --- | --- | --- |
| −162 → −120 | 42.0 | 26.76 | **0.637** |
| −120 → 0 | 120.0 | 107.07 | 0.892 |
| 0 → 120 | 120.0 | 127.69 | 1.064 |
| 120 → 162 | 42.0 | 55.40 | **1.319** |

The far side compresses to 64%, the near side stretches to 132%, and the ink
inside each band compresses and stretches with it. **That gradient is what makes
it read as a turn instead of a slide.** The whole-head narrowing, by contrast, is
the cheap part: ink edge to ink edge, `309 · cos 12° = 302.2` (**derived**; the
record measured 309.0 → 302.2 on the artifact).

⭐ **It is one decision, made once, in the setup geometry, and every deform key
after it is better for free.** There is no cost side to this trade.

### 4.2 The silhouette is a tangent, not a mark — and refining makes it worse

This is the most misleading thing about a face plate, and the counter-intuitive
result of the whole experiment.

A column at `x` sits at depth `z = √(R² − x²)`. Project two adjacent columns and
ask when they **swap order** — when the mesh turns inside out:

```
x₁·cos t − z₁·sin t  =  x₂·cos t − z₂·sin t

                      Δx      x₁ − x₂
  ⇒    tan θ_fold  =  ──  =  ─────────        over ADJACENT columns
                      Δz      z₁ − z₂
```

and a grid folds at the **minimum** of that over its pairs. As the gap closes,
`Δx/Δz → z/|x|`, so the limit for a column is `atan(z / |x|)` — a property of the
**continuous surface**, not of the mesh.

**Re-derived from that formula** (and each agrees with a bisection search on the
shipped column table to 0.01°):

| Columns | Folds at | The pair that folds |
| --- | --- | --- |
| 5 — `±162, ±120, 0` (shipped) | **31.37°** | `−162, −120` |
| 7 — `±145` added | **24.56°** | `−162, −145` |
| 7 — `±155` added | **20.95°** | `−162, −155` |
| 9 — `±155, ±145` added | **20.95°** | `−162, −155` |
| 13 — uniform, every 27 units | 27.54° | `−162, −135` |
| continuous limit at `x = −162` | **17.65°** | — |

🚨 **A denser face mesh is not a safer face mesh.** Refining near the silhouette
drives `Δx/Δz` toward the tangent limit *from above*, so every column you add out
there **lowers** the angle at which the mesh inverts. A coarse grid survives past
17.65° only because it does not *sample* there — it crushes instead of folding.

⚠️ **And the fold angle is set by the outermost gap, not by the column count.**
The 5-, 7- and 9-column rows above make that concrete: the 9-column grid folds at
**exactly** the same 20.95° as the 7-column one, because both contain the pair
`(−162, −155)` and the `±145` column changes nothing. ⇒ Counting vertices tells
you nothing about this failure; **look at the outermost two columns.**

⭐ **The rule, and it is an identity rather than a rule of thumb.** Put the
outermost column at

```
|x|outer = R · cos θmax        ⇒  its tangent limit is EXACTLY θmax
```

because `z = R·sin θ` there and `atan(z/|x|) = θ`. So you do not tune this: you
**pick the ceiling first and the column position falls out.** For `R = 170`
(**derived**):

| θmax you want | Outermost column at |
| --- | --- |
| 12° | 166.3 |
| 16° | 163.4 |
| 20° | 159.7 |
| 26° | 152.8 |

The shipped grid's 162 gives 17.65°, comfortably above the 12° it ships and just
above the 16° §8 calls the instrument's ceiling. ⇒ **Then let the last band be a
single wide one** — that is the direction that buys safety, and it is the
opposite of refining.

🔁 **And this is the section read from the other end: the refusal you get for
picking the ceiling wrong sends you back here by name.** A build whose key
evaluates past the fold angle above is refused by
`A39_DEFORM_KEEPS_TRIANGLE_WINDING` — AUTHORING §5–§6 is the failure map and its
`A39` row reads this message field by field — and the message carries the
triangles, the signed areas, the fix and this section:

**No run reproduces this:** abridged and re-wrapped — the three further triangles it names and its `and 4 more` are cut at the ellipsis, and the run prints the whole refusal on one line; §9.2's build (b) is what prints it

```
FAIL  A39_DEFORM_KEEPS_TRIANGLE_WINDING: animation "turn" deform head/head key 1
      (t=0.6200000047683716s): 8 of 32 triangle(s) reverse winding — triangle 0
      [0,15,16] 1890.000 -> -544.548px²; … The mesh has turned inside out there
      and draws its texture backwards. Fix the key's offsets in the motion
      spec's deform timeline (a projection past its fold angle is the usual
      cause — docs/FACE.md §4.2 has the closed form), or, if this slot folds on
      purpose, declare it in the rig spec as invariants.deformMayFold:
      [{ "slot": "head", "why": … }]
```

⇒ The table above is what *"a projection past its fold angle"* means, and the
outermost-column identity is how you stop meeting the message at all.

🎭 **The fourth way out, and the one a Live2D-style face actually takes: stop
drawing the part.** The ceiling only binds while the part is on screen, so a turn
that has to go past it fades the far cheek or ear out — `rgba` to alpha 0 — or
swaps the attachment away, and another part takes over. `A39` measures that: a
deform key whose slot draws **no pixels at that key's own time** is passed over by
name rather than refused, with the reason on the stats line and beside the key's
own figures in the `DEFORM` block. Two things it is not — the
bar is alpha **exactly 0**, so a part faded halfway is still refused with the
alpha in the message; and it is per key and per time, so the same slot folding at
full alpha anywhere else is refused. ⛔ It is also not
`invariants.deformMayFold`: that field turns the check off for the slot at every
angle, including the ones where the part is fully visible.

🚨 **Fade out *up to* the angle you cannot take, never *at* it — and the gate
keeps that rule rather than asking you to.** The runtime interpolates between
keys, so an alpha-0 key landing exactly on the folding key leaves the frames just
before it drawn and nearly folded (§9.2 measures it: 8 reversed triangles at
alpha 0.20). `A39` scans the spans between consecutive keys as well and refuses
one by name, at a time solved for in closed form and then posed and measured
(AUTHORING §4.11.3). ⇒ The
practical shape is checkable: **key the fade to 0 at or before
the last angle that gates green, and let the fold happen after it.**

📘 **The identity above, used forwards on a `pitch`.**
[`gallery/nod`](https://github.com/rig-c/core/tree/main/gallery/nod)
(repository material) picks its ceiling first and solves the *rows* out of it —
`|y|outer = R·cos θmax` with θmax chosen at 21° giving 140.037 — and then
brackets the fold this section predicts against `A39` itself: **33° gates green
and 34° does not**, with the refusal naming the row pair the closed form names.
That is this table checked from the other end, on the other axis.

### 4.3 The perimeter comes first, and `hull` is read off the triangles

⚠️ **A grid's perimeter is 16 of its 25 vertices, and in row-major order they are
interleaved with the interior.** Spine's `hull` is the first `hull` vertices of
the list, in order — the editor draws the outline by joining them in sequence — so
a row-major grid cannot declare one. And an undeclared hull is not neutral: the
editor's import repairs a `hull: 0` by making
**every** vertex a hull vertex in list order, which is a self-intersecting outline
on the mesh the person refining the draft sees. So the list is written the way the editor writes one: **the perimeter
first, walked around — top row, right column, bottom row, left column — then the
interior, row-major.** rigc derives `hull` from the triangles (AUTHORING §3.4) and
refuses any other order with the walk to renumber along, so getting this wrong
costs one loop rather than a silent file.

**What it costs the reader.** `explain` prints one offset per vertex in list
order, so the run does not read as one row of five values repeated down the
grid: entries 0–15 walk the perimeter and 16–24 are the interior. The column
table is still what to check it against — a vertex's offset depends on its column
alone — and the right column's five entries (4–8) carrying one value is the
quickest check that the walk and the table agree. `gallery/portrait`'s README
shows the listing beside the order.

⚠️ **A large `MESH` overshoot on a face is not a defect.** A rectangular grid
over an oval face has transparent corners, and the line says so:

```
  MESH  head         authored 25 vertices / 32 triangles  (budget 32)  bones=[head]  attachments=[head]  covers 100.00% of the art, reaching 95.90px past it
```

**`covers 100.00%` is what matters** — nothing of the drawing is outside the
triangles. The 95.90px is the corner. A mesh that hugged the silhouette instead
would have to be a `contour`, which cannot be a grid and has **no interior
vertices to redistribute** — so it cannot carry a turn at all.

---

## 5. What foreshortens, and what does not

A feature is a rigid drawing sitting on a curved surface, so it also has to
**narrow** as its patch of surface turns away. That is a bone `scalex`:

```
scaleX = cos(α − t) / cos α          where α = atan2(x, z)
```

The far eye narrows to 89%, the near eye widens to 106% (**derived**: 0.8922 and
1.0641). Parts on the axis get `cos t = 0.9781`.

📘 **How much this is worth depends on the axis, and there is a worked case for
the other one.** The same closed form on the `pitch` of
[`gallery/nod`](https://github.com/rig-c/core/tree/main/gallery/nod)
(repository material) spans **0.863 … 1.176** across its five features, against
the **0.892 … 1.064** above — a wider span at the *identical* angle, because
`α = atan2(coordinate, depth)` grows with the coordinate and a face is taller
than it is deep. ⇒ **The foreshortening buys more on a nod than on a turn**, and
that is arithmetic rather than a judgement about the art.

📌 **The on-axis pair needs no `groups` entry.** `scalex` is the
foreshortening projection of the same `derive` kind §3.1 uses (AUTHORING §4.5.1),
so all six features are one track and the on-axis pair's shared value **falls out
of the arithmetic** — `α = atan2(0, z)` is 0, so `cos(α − t)/cos α` is `cos t`.
A coincidence between two members is not something an author has to notice and
spend a group on.

### 🚨 The iris does not foreshorten, and this is the finding

`iris` and `spark` are children of `eye`, so they inherit the socket's `scalex` —
and **a circular iris under `scalex 0.89` is an ellipse.** That reads as *a
drawing squashed sideways*, not as a head turned, and it is the first thing to
break as the angle grows.

It is also wrong on the physics. If the character keeps looking at the camera
through the turn, her eyeball counter-rotates by the same angle the head yawed,
so the iris stays square-on and stays **circular**. ⇒ **The socket foreshortens;
the pupil does not.**

The fix is one reciprocal per side, on two groups (**derived**):

```
look_l: [iris_l, spark_l]     scalex = 1 / 0.8922 = 1.1208
look_r: [iris_r, spark_r]     scalex = 1 / 1.0641 = 0.9398
```

⭐ **These two stay a shared value on a group, and they are the case where the
per-member construct is the wrong tool** — stated here because "there is a
model" is exactly the reasoning that would spoil them. A counter-scale belongs to
the **socket**, not to the part: `spark_l` sits at local `x = −11` and takes the
same `1.1208` as `iris_l` at `0`, because what is being cancelled is the socket's
foreshortening and not the highlight's own. ⇒ **The value is precisely NOT a
function of the member's position**, so a `groups` entry with one number is the
true statement and a `derive` over `iris_l`/`spark_l` would be a fiction that
happened to use the `derive` field.

⭐ **Their positions still ride the socket, and that is the part that makes it
correct rather than a hack.** A bone's scale moves its children's local
translation, so the highlight at local `(−11, +11)` under the far socket's 0.8922
lands at `−9.81` — it slides 1.19 units inward, toward the surface it reflects
off (**derived**). Only the *shape* is held.

**No run reproduces this:** a person's judgement over seven renders, kept in the `gallery/portrait` record (`FINDINGS.md`, *The measured sweep*); no instrument in this repository grades a turn, so nothing re-takes it and nothing can

📊 **Measured effect on the cliff, by the worked example's own sweep — a
looked-at judgement over seven renders, not a computed figure:** without the
counter-scale the turn stops reading at about **18°**; with it, about **26°**.
Eight degrees of usable range for two tracks, and the record reports nothing else
in the experiment came close to that ratio.

⚠️ **A `clipping` attachment would lift the iris's travel ceiling, and the worked
example has none.** Spine has them (AUTHORING §3.4) and both profiles build one
since issue #1404 retired A11, but the worked example was drawn while A11 refused
a clip under `--profile rig-play`. Its ceiling is therefore geometric: the
iris's ink ring has radius 28.5 against a socket opening 36 half-wide, so
`36 − 28.5 = 7.5` units is as far as it can travel before it crosses its own lash.
⇒ **Without a clip, compute that ceiling from the art before keying a gaze**; the first draft of
the worked example keyed 9 and had to come back to 7.

---

## 6. A blink is a continuous channel, not a swap

**Two ways to blink, and both are right somewhere:**

| | An `attachment` swap | A translating lid plate |
| --- | --- | --- |
| what it is | two drawings, `eyes` and `eyes_shut`, stepped | one plate, one `translatey`, 65 units down its own bone |
| costs | 1 extra PNG | 2 PNGs, 2 bones, 2 slots |
| where it is right | a mascot, a stylised blink, anything whose shut eye is a **different drawing** rather than a covered one | a portrait |

⭐ **Choose the swap for a mascot and the channel for a face**, and the reasons
are all timing:

- **A swap has no shape.** A real blink is fast shut and slow open. The worked
  example is `0.07 s` down and `0.16 s` open — a **1 : 2.3** asymmetry, easing
  into the close and out of the open. A stepped timeline has one frame of
  transition and no curve to put an asymmetry in.
- **A swap has no partial.** A half-blink, a sleepy lid, a lid that rides the
  gaze — every one of them is a *fraction of the same channel*, and none of them
  is a third drawing.
- **A swap has to dodge the frame grid.** A stepped key exactly on a sample time
  can be missed by a player accumulating `1/fps`, which is why
  [`gallery/squash`](https://github.com/rig-c/core/tree/main/gallery/squash)'s
  blink key sits at `0.399999` (AUTHORING §4.5). **A continuous channel does not
  care where the samples land.**

⚠️ **One constraint on the lid's own drawing, and it is an art decision the rig
cannot express.**

**Fade its top edge out, and size the fade in pixels.** A flat plate of skin
translating down a forehead has a visible edge; fading its top 30 pixels
removes it. ⛔ **Do not write that fade proportionally.** In the worked example
it was first authored as `offset 0.34` in `objectBoundingBox` units — 34% of
*whatever height the plate happened to be* — and when the plate grew from 88 to
112 to cover the eye, the faded band grew with it and stopped covering the top
of the shut eye. In `userSpaceOnUse` with `y2="30"` the height becomes a free
variable and the coverage becomes a stated one: `106 − 30 = 76` opaque pixels
above the lash, against a 70-unit eye.

📌 **Blink both lids on one `groups` track.** An L/R offset of one frame was
tried in the worked example and rejected: at 25 fps it does not read as a soft
blink, it reads as a **wink**. ⇒ MOTION §3.7's offset table is about a chain
hanging off a driver, and two lids are not that — they are one event.

---

## 7. Channel allocation, before the first key

🚨 **Whoever composes with this face will layer — an idle that keeps running
under a triggered gaze, under a turn — and two animations keying the same bone
property are BLENDED, not summed.** The rig cannot decide when those play, and it
is the only thing that can decide whether they collide when they do. So the
animations have to divide the rig up front. The
worked example's table, which is the shape of thing to write before authoring
anything:

| Channel | `idle` | `gaze` | `turn` |
| --- | --- | --- | --- |
| `torso` scale, `chest` translatey | ✔ | | |
| `lids` translatey | ✔ | | |
| `brows` translatey | ✔ | ✔ | |
| `irises` / `sparks` translate | | ✔ | |
| `head` + `hair_bang` mesh deform | | | ✔ |
| `faceshift`, feature translatex / scalex | | | ✔ |
| `hairmass` translatex | | | ✔ |
| `lock_l` / `lock_r` / `ahoge` | rotate | rotate | translatex |
| `headroll` rotate | ✔ | ✔ | ✔ |
| `neck` | rotate | | translatex |

Three collisions survive there: `headroll` rotate in all three, `brows`
translatey in two, and the locks' rotate in two. ⚠️ **On plain Spine the fixes
are ordinary — `MixBlend.add` on the layered track, or splitting a bone into a
stack (`headroll_idle` under `headroll_layer`) — but both are runtime or rig
decisions the motion spec cannot express, so nothing warns an author that two of
their animations will fight.**

🚨 **A `slider` is a third way for two animations to meet on one property, and it
is an overwrite rather than a blend — so allocate it in this table too.** An
animation a slider applies (AUTHORING §3.5.2) is never on a track: the constraint
applies it every frame, at whatever time its own bone currently points at. At
`mix: 1` with `additive` left at its default that apply **writes the property
outright**, which erases both any earlier slider on the same property and the
**playing** animation on the bones its animation keys — including at its own
neutral, where it looks switched off. ⇒ Every face axis that shares a target
declares `"additive": true`, and unlike the two collisions above this one **is**
gated: `A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET` names the bone, the property,
every slider keying it in array order and which one wins today. ⛔ The one case
`additive` cannot rescue is a **slot colour, an attachment swap, a draw order or
a sequence**: those timelines ignore the flag entirely, so a fade — §8's way of
taking a part off the screen before its own ceiling — belongs *inside* the single
animation one slider applies, never in a second slider beside it.

⛔ **And the cost is real, so name it rather than discovering it by shipping.** In
the worked example `idle` keys **nothing** on the iris, on purpose, even though a
completely still eye reads as a mannequin. The iris is `gaze`'s channel; an
`idle` drift plus a `gaze` on a second track would be two animations holding two
opinions about where she is looking. **That is a loss, it was chosen, and it is
written down.**

⇒ **The gaze itself is then pure MOTION §3.7** — a chain of offsets, and the only
face-specific part is which bone leads. The worked example's ordering
(**measured** off its own key times):

| Track | Extreme at | What it is |
| --- | --- | --- |
| `irises` translate | **0.22 s** | the eyes lead. `(7, −3)` |
| `sparks` translate | 0.22 s | `(2.8, −1.2)` — **40% of the iris distance**, arriving at the *same time*. A specular highlight is fixed to the light, not to the eyeball, so it lags in **distance** and not in time |
| `brows` translatey | 0.34 s | +1.8, which turns a flick of the eyes into interest |
| `headroll` translatex + rotate | **0.40 s** | the head follows **+12% of the duration after the eyes**. A rigid 3.4-unit slide and a −1.2° roll |
| `lock_l` / `lock_r` / `ahoge` rotate | 0.72 / 0.76 / 0.82 s | **+21% / +24% / +28% after the head**, each with one overshoot crossing of opposite sign |

🩹 **The head's follow there is a rigid slide plus a roll, not a small yaw.** A
head following a gaze really does yaw a few degrees, and that is one `transform`
key with a smaller `degrees` (§1.1). ⇒ What there is to weigh is §7's
table — a yaw on the `gaze` channel is a second animation keying the head mesh's
deform, which `turn` already owns, and that collision is the thing the format
cannot express. Same trade in the turn's anticipation: MOTION §3.6 asks
for a counter-move, and the worked example's is a **−0.9° counter-roll on the
neck bone rather than a counter-yaw**, which would be one more `transform` key.

⭐ **A roll channel is worth having for a second reason: it is where a turn's arc
comes from.** A yaw shift is a straight horizontal line and `translatex` draws
exactly that (MOTION §3.5). A 1.6° roll on a bone at the top of the neck bends
every feature's path into an arc, because a rotation carries its descendants on a
circle for free.

---

## 8. The three cliffs, and picking a construction from the turn you need

Three separate failures at three different angles. ⇒ **Read this before the art
is drawn**, because two of the three are answered by *parts*, and parts are the
expensive thing to change.

**The sweep** — the worked example's `turn` re-derived at seven angles, built,
rendered and looked at. The geometry columns are **derived**; the last column is
the record's looked-at judgement:

**No run reproduces this:** the geometry columns are §1's line evaluated by hand and the last column is a person's, from the sweep in the `gallery/portrait` record; each of the seven builds is `"degrees": <n>` and a rebuild, but no command this page states takes them

| yaw | centre shift | far band 42 → | ratio | 9-unit ink → | reads as a turn? |
| --- | --- | --- | --- | --- | --- |
| 8° | 23.7 | 32.0 | 0.762 | 6.9 | yes, gently |
| **12° (shipped)** | **35.3** | **26.8** | **0.637** | **5.7** | **yes** |
| 16° | 46.9 | 21.4 | 0.509 | 4.6 | yes |
| 20° | 58.1 | 15.9 | 0.379 | 3.4 | marginal |
| 24° | 69.1 | 10.4 | 0.247 | 2.2 | no — the eyes have stopped being eyes |
| 28° | 79.8 | 4.7 | 0.113 | 1.0 | no — the far outline is gone |
| 32° | 90.1 | −0.9 | −0.021 | — | **the mesh has folded** |

**Failure 1 — the iris goes elliptical, at ~18°, and it is fixable.** §5. Two
reciprocal `scalex` tracks buy 8° of range. Do this one always; it is the best
ratio in the experiment.

**Failure 2 — a `scalex` cannot rotate an almond, at ~26°, and it is not
fixable.** The eye *socket* goes next. A real eye at 26° does not narrow
uniformly: its far corner disappears behind the nose bridge, its lash line
rotates, its lid wraps. `scalex` does exactly one of those things, so the far eye
becomes *a thin version of a front-facing eye* and the near eye's lash stretches
into a wide flat slab (**derived** socket scales, from §1's line at the sweep's
own angles and re-derivable from it alone: 0.892/1.064 at 12°, 0.745/1.082
at 24°, 0.629/1.067 at 32° — note the near side barely moves past 20°, which is
why the stretch stops looking like foreshortening). ⇒ **Past roughly 26° the eyes
need their own deform meshes** — socket, lash and lid as a 3–4 column grid each —
and that is where the vertex count stops being 40. The fringe tips (a rigid plate
that should be splaying) and the neck go in the same band for the same reason.

**Failure 3 — the mesh folds, and refining it makes this worse.** §4.2, and it is
the one to design around rather than discover.

🩹 **The neck is the honest fudge, and label yours the same way.** A neck twists:
its top follows the head almost entirely and its base hardly at all. A single
rigid plate can only take an average — the worked example takes **28%** of the
head's shift (`−10` against `−35.345`), which is **the one number in its turn that
is not derived**, chosen as the value at which the chin stopped hanging off the
throat at 12°. A turn that had to read at 20° would need the neck to be its own
mesh with its own column table.

### The verdict on angle

⭐ **A 5-column grid with bone-scaled features is a 0–16° instrument, comfortable
at 12°.** For a standing portrait that is enough: an idle turn, a glance away, a
lean into frame. **A 30–45° three-quarter turn is a different rig** — per-eye
meshes, a meshed neck, probably a second art layer for the far cheek — and it is
not a format problem, it is a parts-and-labour problem.

📊 **What one held yaw actually costs**, from the shipped `motion.json`
(**derived** by counting it):

| Animation | Duration | Tracks | Track keys | Deform entries | Deform keys | Hand-written deform floats |
| --- | --- | --- | --- | --- | --- | --- |
| `idle` | 3.2 s | 9 | 37 | 0 | 0 | 0 |
| `gaze` | 1.5 s | 8 | 32 | 0 | 0 | 0 |
| **`turn`** | 2.2 s | **8** | **33** | 2 | 8 | **0** |

⇒ **`idle` and `gaze` cost what an ordinary MOTION.md shot costs, and the turn
has no transcription in it.** The deform is four `transform` keys (§1.1) and the
compiler writes the run: **five distinct values** per head key (one per column,
repeated down five rows), with **25 of its 50 slots structurally `0`** because a
yaw has no vertical component. The **tracks** column is 8 because the features are
two group tracks whose keys state a model (§3, AUTHORING §4.5.1) and the four hair
parts are one.

🚨 **And here is the number that matters more than either count: what the
hand-written figures ARE.** The turn states **34 depths** — of which **11 are
distinct**, the rest being the same table repeated on the second held key and on
the `scalex` track. ⇒ The point is **auditability**: a residual of `1.14` is a
number a reader can only take on trust, and `brow_r at depth 158` is a claim they
can argue with. §3 is why that is the whole point, and §2 is why the depths had
nowhere else to live.

⚠️ **A plain `groups` entry still buys almost nothing on a face, and that is
structural rather than an oversight.** Keying several bones **identically** is
right for a wheel pair, and **every part needing a different number is what
parallax means.** The on-axis pair's shared `cos t` falls out of the same closed
form as everybody else's value, so it needs no group, while `look_l`/`look_r` stay
one — because those two really are one shared number (§5).

### The turn as a value rather than a time

Everything above prices a turn as an animation somebody plays. The same geometry
also runs on an **axis**: a `slider` constraint reads a driving bone, maps that
bone's rotation to a time inside the turn animation, and applies the animation
there (AUTHORING §3.5.2). Nothing in §1–§5 changes — the keys are still §1's line
evaluated at each angle — but what selects among them is a **value** rather than a
playhead, so the face follows a number somebody else is holding: a pointer, a gaze
target, a game state.

⭐ **The object offers a dial and does not decide when it turns.** That is the
whole of the claim and it is deliberately not a larger one: what the rig
guarantees is the axis — its range, its arithmetic, and that every angle on it is
sound — and what moves the dial belongs to whoever is using the face. The
paragraphs below are the part that is ours.

#### The range stops being a choice and becomes a measurement

This is the half an author has no other way to get right. §4.2's fold angle is not
a rule of thumb once the angle is a dial position: it is the **top of the dial**,
because past it a triangle turns inside out and `A39` refuses the build by name.
`build` prints that angle for every depth mesh it compiles (AUTHORING §3.4), so
the whole mapping falls out of one reading:

```
ceiling    the largest turn this depth mesh admits — printed by `build`, not guessed
range      the largest whole degree strictly INSIDE the ceiling
from       -range        max  +range        local  true   (AUTHORING §3.5.2's circle)
scale      seconds per degree — the one number here you choose
duration   2 x range x scale
time       to + (degrees - from) x scale    the slider's own mapping
```

📐 **Worked, on [`gallery/look`](https://github.com/rig-c/core/tree/main/gallery/look)**,
whose face is a 21 × 9 `grid` over one depth sheet:

```bash
bun cli.ts build --rig gallery/look/rig.json \
                 --motion gallery/look/motion.json \
                 --out gallery/look/build
```

```
  MESH  head         grid     189 vertices / 320 triangles  (budget 320)  bones=[head]  attachments=[head]
        depth "face_depth.png" bf156ea0cfc970a3 near=white zScale=194 z=[0, 194]
        80 of 189 vertices sample a texel the part image does not draw — their z is the sheet's reading of somewhere the part is not
        turn ceiling  yaw +19.32° / -19.32°   pitch +22.92° / -26.94°
          1st pct     yaw +19.32° x1.000 of 80 / -19.32° x1.000 of 80   pitch +22.92° x1.000 of 102 / -26.94° x1.000 of 130
                      first to fold: yaw + at 19.32°, triangle 174 [119,138,139], the sheet steps 28.50 level(s) across it, which is 0.112 of the range this mesh sampled
```

⇒ the ceiling is **±19.32°**, so the range is **19** — `floor(19.32)`, and
*strictly inside* is the whole of the rule. At the **0.05 s per degree** that rig
chooses, `turn` runs `2 × 19 × 0.05` = **1.9 s** and the map is
`time = 0 + (degrees + 19) × 0.05`, which is the constraint as its rig spec
declares it: `"from": -19, "to": 0, "scale": 0.05, "max": 19, "local": true,
"additive": true`. ⭐ **The only two numbers there that anybody chose are `scale`
and `to`** — and `to: 0` says nothing more than *the bottom of the range is the
animation's first frame*. `from`, `max` and the duration are all the ceiling.

🔸 **And `scale` is chosen for the endpoint.** rigc emits every number as its
float32's shortest name, so a `scale` the float cannot hold moves the top of the
dial: `1/60` ships as `0.016666668`, and a 60° turn then applies at 1.00000008 s
rather than 1 s — the last frame under `loop: false`, the *first* under
`loop: true` (AUTHORING §3.5.2). `0.05` is its own float's name, so the file states
exactly `0.05`, which is the only reason the example can put its endpoint exactly
on the duration. Pick a `scale` that is not, and land the endpoint inside the
duration instead.

⚠️ **The ceiling is per mesh, and the face's is not the smallest one on the
face.** The same run prints one for every depth mesh, and in this example each
sidelock reads `yaw +17.04° / -45.80°`: it folds at **17.04°** on one side, which
is *inside* the ±19° the face itself admits, and not until 45.80° on the other.
The asymmetry is the sheet's, not a coincidence — each of those sheets is
steepest at the edge where the strand curves away, and a yaw folds a pair of
vertices only in the direction their depth is rising.

⇒ **A part whose ceiling is lower than the range has to be gone before the turn
reaches it.** That is AUTHORING §3.4's third way to live with a ceiling: fade the
slot to alpha 0 **inside the animation the slider applies**, landing the alpha-0
key *before* the key that folds rather than on it. §7's paragraph on sliders is
why that fade cannot be a second slider.

⭐ **A lookup table wants linear keys, and that is not a style note.** The slider
makes the pose a function of the dial, so an easing curve between two keys makes
it a **non-linear** function of a number the consumer may be holding perfectly
still — the face would drift and settle while the value sits where it was put.
Anticipation and follow-through fail for the same reason, not a weaker one
(MOTION §3.6, §3.7): both are functions of time, and there is no time on this
axis. [MOTION §0.1](MOTION.md) is that split written out, and it is also where the
shaping *does* belong — in whatever animation moves the dial.

⚠️ **Two axes on one face need `"additive": true` on both.** A `pitch` dial
beside the `yaw` is the ordinary case and it is the one the format's default
breaks the moment the two share a target — in the worked example both `turn` and
`tilt` key `headroll`. §7's paragraph on sliders is the mechanism and
`A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET` is the refusal.

✅ **And the space between the two dials is measured rather than inferred.**
Two additive sliders posed
at a grid of *both* values — and over a rotation and a translation, so the claim
is not one property's — are the closed-form sum at every cell of it, to float64:
each slider maps its own reading to a time by §3.5.2's rule, its animation is read
there, and the two contributions add. ⭐ That is a property of the **interior**
and not of the corners, which is the whole reason it needed a grid: with an `ease` on one of the two
animations, every corner of the space still reads as correct while most of the
inside has moved. ⇒ **a
lookup table wants linear keys for a second reason** — not only that the face
would drift while the value sat still, but that a curve is invisible to any check
that reads an axis at its ends.

⚠️ **And `mix` below 1 is not what it looks like when the later slider is not
additive.** An additive slider scales its whole contribution by its own `mix`, so
two of them at any pair of mixes are still the sum — which is why `A40` skipping
below full authority is right: what happens there is a weighting, not the erasure
it refuses. A **non-additive** slider at `mix` α applies
`current + (value + setup − current) × α`, a lerp *from the pose it found*, so the
earlier slider is not erased — it is attenuated by `1 − α`. A pitch dial turned
halfway down takes that share of the yaw with it, on every frame, with the gate
green. ⇒ write `"additive": true` on **every** slider that shares a target and
not only on the later one, which is what the paragraph above already asks for and
this is the second reason for.

🚨 **A second dial on a slot colour, an attachment swap or a draw order is not a
second dial at all.** Those timelines ignore `additive`, so the flag is not the
repair and writing it on both changes nothing: the slider **later in the
`constraints` array** owns that property outright and the earlier one contributes
nothing, at every position of its dial. An **ik constraint's mix** behaves the
same way. What does compose is the rest of what a face keys — a bone transform, a
mesh deform, a transform constraint's mix, a physics `wind`, a path constraint's
`mix`, and another slider's own `mix` or `time` — and those are the same sum as
the two axes above, over each target's own setup value. ⇒ if a blink fades a slot
and the yaw dial also fades it, one of the two has to stop: key that property
from **one** slider, or move both edits into the animation a single slider
applies. `A40` refuses the rest by name, and AUTHORING §3.5.2 is the mechanism.

✅ **And which of the two a timeline is, the gate poses rather than asks.**
`A40` applies the shared timeline twice with `add` set and reads whether the second
application accumulated, rather than reading `Timeline.additive`, the runtime's own
declaration, which two classes state falsely about themselves — a path
constraint's `mix` and a slider's `time`, both in the composing list above. Two
dials whose animations both fire **events** are not refused either: a slider fires
no event at all — it applies its animation with `firedEvents` null.

⭐ **Three dials are the same sum as two — as long as every one of them is
additive.** The case worth knowing is a non-additive dial in the *middle* of
three, because it is neither of the two failures you would expect: it erases every
dial **before** it and is then added to by every dial **after** it, so the face is
neither the sum nor the last dial alone, and no reading of a two-dial rig has that
shape.

⚠️ **`"loop": true` puts the animation's FIRST frame at the top of the dial.** A
looping slider wraps its time as a positive modulo rather than holding the last
frame, so the axis is a sawtooth: the two ends of the range are the same pose and
every position past the top repeats the range from its bottom. That is right for a
parameter that genuinely cycles — a wheel, a breath — and wrong for a yaw, where
the range's top has to *stay* at the extreme of the turn. Leave `loop` off for a
face axis; the default is the one you want.

🔸 **And a `local: false` dial never reads back the number you set.** The world
reader goes through the bone's matrix, where the reference runtime's float32 π
leaves a fraction of a degree behind, and it has a period: a bone one whole turn
from its position reads *identically*, so the dial cannot tell the two apart. The
composition is unchanged — two world dials add exactly as two local ones do — but
`local: true` is what makes the number on the dial the number the rig reads, which
is the same repair §3.5.2's circle already asks for. Every one of the six
`property` readings composes by that one arithmetic under `local: true`, and so
does every one of them read through the world — the composition is the same sum
on both sides of the flag, and what the flag changes is what the dial can say.

🚨 **A `local: false` scale axis folds at zero: the negative half is the positive
half again.** A world scale reading is a square root, so a dial at −2 and a dial
at +2 are not two positions — they read the same, select the same frame and pose
the same face. Nothing at compile or at runtime says so, and a squash axis
authored through negative scale therefore gets the mirror of the dial you wrote,
symmetric about the point where it should have passed through. A world `shearY`
axis folds the same way at a whole turn, and its seam is not at a fixed value —
it moves with wherever the bone is pointing. ⇒ for a scale or a shear axis, write
`local: true`; for a scale axis you cannot, keep the whole range on one side of
zero, because the reader has no other half to give you.

⭐ **A dial can drive another dial's authority, and that composes as a product.**
A slider's own `mix` is a keyable property, so one axis can scale another axis'
whole contribution — a "strength" dial over an expression, which is the one shape
on this page that multiplies rather than adds. ⚠️ **It only works downward through
the `constraints` array.** A slider reads its own authority when its turn comes
and the array is the update order, so a dial that keys the `mix` of a slider
*earlier* than itself writes a number that slider has already read past: the
driven axis is dead at every position, every frame. ✅ **The gate names that
pair** — `A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER` refuses it with both
sliders, the property and both array indices, and says which way to move them.
⇒ put the driving slider **first**, which is what the refusal tells you to do.

🚨 **And a dial cannot turn itself on.** `Slider.update` reads its own `mix` as
the alpha it applies the animation with, before that animation runs, so a slider
whose *own* animation keys its `mix` writes after the only read of it — the same
refusal with the two array indices equal. The shape to watch for is an axis
muted at setup that means to raise itself: it never applies anything at all,
because `update` returns on `mix` 0 before reaching the key that would raise it,
and `A37` reports green because it asks whether *an* animation keys the mix and
never which one.

🚨 **And it is not only another dial: a face axis that drives a jiggle or a
path is the same rule.** `physics.<name>.wind`, `path.<name>.position`, an ik or
transform mix — every property a dial can key belongs to a constraint that reads
it when its own turn comes, and that turn is its place in `constraints`. A
"wind strength" dial declared after the physics constraint it drives poses the
number in that constraint's pose and moves nothing at all: [measured] the bone a
physics constraint drives travels `0.000e+0` across the dial with the constraint
declared first and `4.256e+2` with it declared last, and a path constraint's
rider `0.000e+0` against `1.620e+2`. ✅ `A42` names those pairs
too, with the constraint's kind and both array indices. ⇒ **every constraint a
dial drives goes after that dial in `constraints`** — which, for a face, means
the dials come first and the jiggles, paths and aim constraints they scale come
after. 🔸 One key is outside the rule because no order repairs it: a `physics`
`reset` from a dial fires on a crossed frame time and a slider applies its
animation at a single instant, so it never fires at all — the gate says that in
its SKIP rather than asking you to move anything.

🔸 **The bone-less slider is the same story one field over.** A slider with no
`bone` takes its time from `slider.<name>.time`, which any animation can key — and
two dials keying it *add*, so a time-driven axis composes like everything else
here, and the gate agrees. The same array rule applies, for the
same reason — and `A42` refuses it there too, naming `time` instead of `mix`.
⚠️ Two things the bone
form does and this one does not: there is no `Math.max(0, time)` and no wrap, so a
driven time below zero does not pose the first frame — it leaves the pose exactly
as it found it, which is a different picture whenever the animation's first frame
is not the rest pose.

⚠️ **Two `skinRequired` sliders are three states, not two.** Under a skin that
lists one of them the face is that dial alone; under a skin that lists the other
it is the other alone; and under a skin that lists **neither** — the default skin
is usually one — every dial is dead and the face holds its rest pose with both
dials turned to their extremes. That last state is indistinguishable, from the
outside, from a rig whose sliders do not work, and the gate is right to be silent
about it because the pair genuinely never meets.

⭐ **Four dials are the same sum as three.** Nothing new arrives with the fourth
axis: the arithmetic, the flag, and the non-additive-in-the-middle case all read
exactly as they do above. Write `"additive": true` on all of them.

✅ **The editor half, measured.** The round trip was taken with
`tools/editor_roundtrip.ts` on a licensed editor (data version 4.3.26) against a 4.3.13 build of
[`gallery/look`](https://github.com/rig-c/core/tree/main/gallery/look) — this
subsection's worked case, not the `gallery/portrait` this page names at the top,
which declares no constraints at all and so can carry no slider. What it found:

- **Both sliders come back, and the parameter axis survives.** `additive`,
  `local`, `bone`, `property`, `from`, `max` and `scale` are identical field for
  field, and the two keep their places in the `constraints` array. `mix: 1` and
  `to: 0` are dropped, and those are the format's own defaults (`SkeletonJson`
  reads `mix` as 1 and `to` as 0 when absent) — an elision, not a loss.
- ⚠️ **The animation each slider *names* comes back because rigc emits
  animations in the editor's own order** — natural and case-insensitive. The
  editor re-sorts the `animations` object and a slider's animation is an ordinal
  in the format, so out of that order `yaw -> "turn"` returns as
  `yaw -> "sweep"` — the first animation of the sorted list. In order, on the
  same rig through the same editor, `yaw -> "turn"` comes back and the
  re-rendered mean absolute error is 0.3035 / 0.0769 / 0.0588
  (`sweep` / `tilt` / `turn`) against 10.4655 / 8.4961 / 8.7140 out of order,
  worst drift 3.947 px against 16.535 px.
- 🚨 **The physics constraint on the cowlick comes back driving nothing.**
  `rotate: 1` is absent from the export, and an absent `rotate` parses as **0**
  (`SkeletonJson`), so the returned file states *drives nothing* rather than
  omitting a default — which is why `A23_PHYSICS_CONSTRAINT_EFFECTIVE` refuses it
  by name. Independent of the ordering.

  ✅ **Why, measured** — and corrected. It is not elision and not a defect in
  one field. Issue #540 measured three rigs and twelve constraints, predictions
  written before the round trip: a lone `y` came back, `x` and `y` together came
  back, and a lone `rotate`, a lone `scaleX` and a lone `shearX` each came back as
  **no components at all**, with every constraint's fixed-point `strength`
  returning exactly. It read that as *"the editor's physics model holds `x` and
  `y` and nothing else"*, and that reading was wrong.

  🔁 **Corrected 2026-10-06 (issue #1196), on Spine 4.3.23 and 4.3.26:** what
  decides the loss is the **bone's length**, not the component. The editor's own
  example export `sack-pro` keeps 18 of 18 `rotate` constraints through the same
  import and export, and deleting the `length` of one of its bones loses `rotate`
  on exactly that one constraint. `look` with a 40-unit `ahoge_whip` keeps
  `rotate`, `scaleX` and `shearX` each; at 0.01 and 1 `rotate` is kept too; with no
  length all three are lost, on both versions. `look`'s `ahoge_whip` was emitted
  with no length; #540's rigs were not at hand to read, but every row it reported
  is reproduced here at length 0. ⇒
  **A rotation-driven jiggle survives the editor on a bone that has a length**,
  and `A23_PHYSICS_CONSTRAINT_EFFECTIVE` refuses one on a bone that has none
  (issue #1195).

  ✅ **And the locus is measured: the loss is at EXPORT** — against Spine
  4.3.26 and without decoding the project format. `gallery/look`'s build and three variants of its
  `skeleton.json` were each imported with the documented CLI, the project files
  inflated, and compared byte by byte. **Two imports of the same file differ
  only at bytes 13–28** — a timestamp or a hash — so that is the noise floor,
  and reading the bytes works because everything below byte 1914 is stable
  across imports. Against that floor the **only** stable difference between the
  `rotate`-driving file and the `rotate`-less one is the float32 at byte 248:
  `3f 80 00 00` = **1.0** where the source said `rotate: 1`, `7f c0 00 00` =
  **NaN** — the editor's own unset — where it did not, while an `x: 1` variant
  leaves 248 at NaN and moves a slot 66 bytes on, which is the component that
  survives. ⇒ The importer read `rotate` and kept it as a **non-default** value;
  the exporter wrote nothing for it. It is the editor's **writer**, not its
  reader, and not rigc's emitter.

  The importer stores the value on a zero-length bone too, at 4.3.23 as well as
  4.3.26 (issue #1196: `rotate: 0.234375` lands as `3e 70 00 00` in the project,
  and the JSON and binary exports both omit it — the binary export of a project
  holding `rotate: 1` is byte-identical to one holding NaN).

  🗑️ **A41, the rule that gated the editor round trip, and its declaration
  `invariants.editorRoundTrip` were retired in issue #1196.** They gated the
  components rather than the bone, so they refused rotation physics the editor
  keeps, and once A23 refuses those components on a zero-length bone a rig that
  passes it has nothing the editor's export drops — the declaration could no
  longer move a verdict.
- 🔸 Unexplained, and **unreproduced by anything in this tree**: `diff` reports
  `animations.curve_kinds` moved on **196 of 200** keys in every round trip taken,
  the clean one included. Visually small once the ordering is fixed — but it is
  98% of the keys, and *small* is not *explained*. ⚠️ **[measured] by
  `tools/editor_roundtrip.ts` on the trips this subsection records, and no
  command this page states re-takes it** — so read the figure as those runs' and
  not as a property the gate holds.

✅ **Two more things are measured, and both came back safe:**

- **More than one event is safe.** The editor re-keys `events` the way it re-keys
  `animations` — `zebra, mike, alpha` came back `alpha, mike, zebra` — but every
  firing resolved **by name**, `0.3 -> mike` and `0.6 -> alpha`, payloads intact. The ordinal shape does
  *not* bite here, and rigc emits events in the order you declare them.
- **More than one skin imports.** A four-skin rig imports in **both build
  modes** — default and `--copy-images` — **exit 0, project written**. What binds
  is a `CompileError` when the default skin shares a placeholder with a named
  one. ⇒ Skins are not the reason to stay at one, and every figure on this page
  was taken on a rig carrying exactly one (AUTHORING §10.1).

Every figure above was read back through `spine-core`.

---

## 9. Looking at it, and the audit gap

### 9.1 The looking protocol is three scales, not one

| Scale | What it is for |
| --- | --- |
| **the contact sheet** (~0.45×) | whether the **motion** reads. Spacing is a comparison *across* frames, so the grid is the only place to see it |
| **1:1** | whether the **drawing arrived** |
| **3–4× on the eyes** | because that is where a reader will look, and a face has no other equivalent |

📊 **Four of the five art defects in the worked example were invisible at contact
sheet scale** and all four were found at 1:1 or better: the dark seam, the lid's fade letting a
shut eye's lash show through as a grey smudge, the iris crossing its own lash at
the gaze extreme, and a forehead highlight turning the lid's soft edge into a
tonal step.

⚠️ **A portrait's plates are *supposed* to overlap invisibly**, and that is
where a renderer's edge defect shows: a part that carries an ink outline at its
edge hides one, because a dark rim on a dark line cannot be seen. ⇒ **Scene work exercises a renderer where game-part work does
not.** Expect to find renderer defects on your first face, and check a suspicious
edge against a **region build** before reading a single vertex — which is the
next item.

⭐ **When a mesh is the new thing in a shot, build the region version and diff it
before suspecting the mesh.** The worked example's first seam suspect was the
grid: faint vertical lines down the forehead, at what looked like column
positions. Building the same rig with both meshes replaced by plain regions and
diffing the rest frame settled it in one command — worst channel difference 1,
zero pixels differing — so the mesh was innocent and the lines were art
compositing. **Two minutes, and it halves the search space.**

📌 **Draw the face before you rig it.** The worked example took **seven art
passes before a `rig.json` existed** — brows twice, hair silhouette, fringe
depth, neck length, garment mass, choker, proportions. That order is not
fastidiousness: **the head plate's half-width *is* `R`, and `R` is in every one of
the thirty derived numbers.** Rigging first means re-deriving all of them every
time the plate changes width.

⚠️ **And expression lives in ink weight before it lives in shape.** The worked
example's brows read as a scowl for two iterations and the brows were not the
problem — two eyes whose upper lash is heaviest at the **inner** corner read as
angry whatever the brow above them does. Worth knowing before spending a pass on
the wrong part.

### 9.2 🚨 The half nothing measures — three builds, one of them refused

**The setup geometry is measured; one half of the deformed geometry is not.**
Here is that claim as three builds of the same rig, each command runnable verbatim from a
clean checkout. Start from the good one:

```bash
bun install                                     # once

bun cli.ts build --rig gallery/portrait/rig.json \
                 --motion gallery/portrait/motion.json \
                 --out gallery/portrait/build --profile rig-play
bun cli.ts render --candidate gallery/portrait/build --fps 25 --max 640 \
                 --out gallery/portrait/render
```

```
  MESH  head         authored 25 vertices / 32 triangles  (budget 32)  bones=[head]  attachments=[head]  covers 100.00% of the art, reaching 95.90px past it
  MESH  hair_bang    authored 15 vertices / 16 triangles  (budget 32)  bones=[bang]  attachments=[hair_bang]  covers 100.00% of the art, reaching 55.22px past it
  ..    validate (spine-core round trip + machine assertions, profile rig-play)
  ..    profile rig-play — every assertion applies
```

Green — the profile line above says so in the tool's own words.

Now break the projection two ways. Both scripts write a variant motion spec
beside the originals and touch nothing in the repository:

```bash
# (a) INVERT ONE BAND: give the two far columns each other's shift.
#     The far side now STRETCHES 1.363 where it should compress to 0.637 —
#     the head reads as turning the other way at its own edge. This one has to
#     REPLACE the transform with a table: an inverted band is not the closed
#     form at any angle, and §1.1 refuses a `transform` beside a `vertices` run.
#     Each vertex takes the shift for THE COLUMN IT IS IN, looked up in the rig:
#     a `vertices` run is positional, so a script that assumes the list's order
#     rather than reading it breaks in silence the day the list is renumbered.
bun -e '
const r = await Bun.file("gallery/portrait/rig.json").json();
const m = await Bun.file("gallery/portrait/motion.json").json();
const v = r.skins.default.head.head.vertices;
const d = m.animations.turn.deform.find(x => x.slot === "head");
const shift = {"-162": -22.414, "-120": -7.175, "0": -35.345, "120": -27.658, "162": -14.255};
const run = [];
for (let i = 0; i < v.length / 2; i++) run.push(shift[v[i * 2]], 0);
for (const k of d.keys) if (k.transform) {
  delete k.transform;
  k.fromVertex = 0;
  k.vertices = run;
}
await Bun.write("/tmp/swapped.motion.json", JSON.stringify(m, null, 2));
'
bun cli.ts build --rig gallery/portrait/rig.json --motion /tmp/swapped.motion.json \
                 --out /tmp/swapped --profile rig-play

# (b) FOLD IT: evaluate the same closed form at 40°, past the 31.37° of §4.2,
#     so the two far columns swap order and the mesh turns inside out. Since
#     §1.1 the whole of it is one number.
bun -e '
const m = await Bun.file("gallery/portrait/motion.json").json();
const d = m.animations.turn.deform.find(x => x.slot === "head");
for (const k of d.keys) if (k.transform) k.transform.degrees = 40;
await Bun.write("/tmp/folded.motion.json", JSON.stringify(m, null, 2));
'
bun cli.ts build --rig gallery/portrait/rig.json --motion /tmp/folded.motion.json \
                 --out /tmp/folded --profile rig-play
```

**What comes back from both:**

| | good | (a) one band inverted | (b) mesh folded |
| --- | --- | --- | --- |
| `--profile rig-play`, **without `A39`** | green | **green, and the same counts** | **green, and the same counts** |
| `A35_DEFORM_KEYS_FIT_THE_ATTACHMENT` | PASS | **PASS** | **PASS** |
| the `MESH` coverage line | 100.00%, 95.90px past | **byte-identical** | **byte-identical** |
| `A39_DEFORM_KEEPS_TRIANGLE_WINDING` | PASS | PASS | **FAIL, both keys, 8 of 32 triangles** |
| `--profile rig-play`, **with `A39`** | green | green | **refused, and nothing written** |
| the `DEFORM` block, `head` key 1 `area` | x0.637174 … x1.319122 | **x0.765250 … x1.362834** | **x−0.288121 … x1.820211** |
| … and its `winding` | 32 of 32 kept | 32 of 32 kept | **24 of 32 kept** |

🚨 **All three were green, and the coverage line is the same string in all three,
because it reports the SETUP pose.** The `--profile rig-play` row with `A39` is
the only verdict that separates them, and the two rows above it measure only the
setup geometry: `A35` is silent about build (b). `A35` checks that a deform run *fits* its
attachment — an honest and useful check, and orthogonal to whether the numbers in
it mean anything.

⭐ **The two `DEFORM` rows are the ones that separate (a) from the good build**,
and nothing else in the toolchain does that without a reference render. `A39` is
right to pass (a) — no triangle reverses — so the whole of the difference is a
pair of ratios, and the way to read them is to ask the tool rather than to copy
them down:

```bash
bun cli.ts explain --rig gallery/portrait/rig.json \
                   --motion /tmp/swapped.motion.json --out /tmp/explain-swapped
```

```
  DEFORM  turn  default/head/head  key 1  t=0.620000  authored table
          frame      played on a track
          moved      25 of 25 vertices, worst 35.3450px at v10
          area       min x0.765250 tri 19   max x1.362834 tri 1   (32 triangles, 0 with no area at the cleared pose, band 0.146694px²)
          stretch    max x1.362834 tri 1   min x0.765250 tri 26
          winding    32 of 32 kept, 0 collapsed
```

🚨 **Read it band by band, because the extremes have swapped ends and comparing
worst to worst hides that.** The block names the triangle beside every ratio, and
§4.1's table says what each band should be. `tri 1` spans **−162 → −120**, the
band §4.1 puts at **0.637** and the good build's own block reports as
`x0.637174 tri 17` — the same band, and here it comes back at **x1.362834**. That
is this section's prose, *"stretches 1.363 where it should compress to 0.637"*, as
a figure the tool produces, and it is the far edge turning the wrong way. `tri 19`
spans **−120 → 0**, tabled at 0.892 and measured at **x0.765250**: the swapped
column is the boundary between those two bands, so the compression the far band
gave up lands next door. ⚠️ Read as min-against-min and max-against-max instead,
the very same four figures say 1.319 → 1.363 and 0.637 → 0.765 — two comparisons
across *different* bands, both of them mild, neither of them what happened. Only
the two bands the swapped columns bound move at all: the 0 → 120 and 120 → 162
bands still read **1.064** and **1.319**, exactly as §4.1 tables them. `authored table` on the key line is the other half of the diagnosis:
the model is gone, so nothing is left to check the ratios against but the ratios.

`rigc explain` is the instrument that prints every timeline's actual values, and
on a deform that is the model and every offset it produced (AUTHORING §4.11.1)
and the `DEFORM` block's geometry (AUTHORING §4.11.2) —

```bash
bun cli.ts explain --rig gallery/portrait/rig.json \
                   --motion gallery/portrait/motion.json --out /tmp/explain
```

```
  DEFORM  turn  default/head/head  key 1  t=0.620000  transform yaw  radius=170 degrees=12
          frame      played on a track
          moved      25 of 25 vertices, worst 35.3450px at v2
          area       min x0.637174 tri 17   max x1.319122 tri 31   (32 triangles, 0 with no area at the cleared pose, band 0.146694px²)
          stretch    max x1.319121 tri 22   min x0.637175 tri 8
          winding    32 of 32 kept, 0 collapsed
```

⇒ **`0.637` is a figure the tool prints.** It is a *report* and not a bar —
`explain` takes no `--profile` and gates nothing, because a deliberate
3× stretch is a real thing to author, and the one deformed-geometry fault with no
legitimate counter-example is the fold, which is `A39`'s.

**`A39_DEFORM_KEEPS_TRIANGLE_WINDING` closes the half of that gap the fold
lives in** — `--profile rig-play`. Build (b) above is refused
by name, on both its keys, with the triangles listed:

```
FAIL  A39_DEFORM_KEEPS_TRIANGLE_WINDING: animation "turn" deform head/head key 1
      (t=0.6200000047683716s): 8 of 32 triangle(s) reverse winding — triangle 0
      [0,15,16] 1890.000 -> -544.548px²; …
```

and builds (a) and the good one both still PASS it, because **an inverted band is
not a fold**: its winding survives. The angle A39 first fires at agrees with
§4.2's `tan θ = Δx/Δz` to **0.0001°**, so the formula above is checkable by
running the gate instead of by rendering seven variants.

**And one thing it does not refuse.** Build (b) is refused
because the head is *drawn* while it folds. Fade that slot to alpha exactly 0 over
the same keys — §4.2's fourth way out, and what a face past its ceiling actually
does — and the same build is green, with the key still measured and the reason
printed rather than passed over in silence:

```
  DEFORM  turn  default/head/head  key 1  t=0.500000  transform yaw  radius=170 degrees=40
          skipped    A39 reads no winding off this key: the slot's alpha is exactly 0 at this
                     time (slot 0.0000 x attachment 1.0000), so this key draws no pixels — a
                     triangle that draws no pixels cannot draw them backwards
          winding    24 of 32 kept, 0 collapsed  <- a fold, and nothing gates it: this key draws no pixels
```

`A39`'s message says the mesh "draws its texture backwards there", and that
sentence is false when the slot draws nothing. The bar is **alpha exactly
0**; at 0.5 build (b) is refused, with the alpha in the message. The
same fold at full alpha in another animation is refused, because the
measurement is of one key at one time.

🚨 **And a key is not the whole of it: the geometry between two keys is
interpolated.** Put the alpha-0 key exactly on
the 40° key and 8 triangles are already reversed at `t=0.4`, where the slot is
still drawing at **alpha 0.20**:

| t | slot alpha | reversed triangles |
| --- | ---: | ---: |
| 0.30 | 0.40 | 0 |
| 0.40 | **0.20** | **8** |
| 0.45 | 0.10 | 8 |
| 0.49 | 0.02 | 8 |
| 0.50 | 0.00 | 8 |

📌 The table and the refusal below are on the **turn probe** — this head's own
five columns and 32 triangles on a one-second timeline, which is why the times
are not build (b)'s.

**Every interval between two consecutive deform keys is scanned.** A deform interpolated between two
keys travels a **straight line through offset space**, so a triangle's signed
area is a *quadratic in the interpolation fraction* — the fold is a root of it,
solved for rather than searched, with no sample spacing anybody would have to
defend. What that arithmetic names is then posed and measured by the same code
that measures a key, **alpha read at that same instant**, so the fade a correct
rig relies on is not refused and the frames it does not cover are. The sentence names
the two keys the fold lies between rather than one key index, the time it solved for
and how far along the segment that is, the reversed triangles with their signed areas,
`NO KEY LANDS THERE` in those words, and the alpha read at that same instant — so what
it refuses is legible as a frame rather than as a key. AUTHORING §4.11.3 reads it field
by field and [`src/validate.ts`](../src/validate.ts) builds it; no spec this repository
ships produces one.

⇒ The rule — *fade out over the run up to the angle you cannot
take, so that every key past the ceiling is one that draws nothing* — is a
**measurement**: land the alpha-0 key
on the fold and the build is refused, with the frame it is refused for.

⚠️ **What that scan cannot see**: the closed form holds the BONES still across the span. On an
unweighted attachment that is exact — one matrix multiplies every vertex and its
determinant cancels out of the sign comparison — but on a weighted mesh whose
bones move across the span it is an approximation, and a prediction no
measurement reproduced is reported (`deformSpansUnconfirmed`) rather than
refused. A fold caused by the bones alone is not this rule's subject at all, and
`check` against a trusted render (§9.3) is what sees it.

⚠️ **One thing it deliberately does not do.** It is an **archetype** rule, so a
`--profile spine` build reads `PROF` — the premise "a fold has no legitimate
counter-example" is false: an official
`spineboy-pro` export reverses one of `hoverboard-board`'s 101 triangles, and a
`validity` rule would have told its author to change correct data. ⇒ `explain`'s
`DEFORM` block is the surface with **no profile at all**, so the winding count is
readable on a `--profile spine` build the gate will not mention it to.

`check` against a trusted render, below, stays the deeper instrument for the
reasons §9.3 gives, and these two are the cheap always-on layer above it.

### 9.3 The audit that works today, and exactly what it cannot do

`rigc check` renders a candidate onto reference frames' own pixel grid and
compares (INGEST §1.4). Point it at a render of a build you already trust and it
**does** see a wrong deform:

```bash
bun cli.ts check --candidate gallery/portrait/build --frames gallery/portrait/render/turn@25fps
bun cli.ts check --candidate /tmp/swapped           --frames gallery/portrait/render/turn@25fps
bun cli.ts check --candidate /tmp/folded            --frames gallery/portrait/render/turn@25fps
```

⚠️ **The third of those needs a build §9.2's own command will not write.** Build (b)
under `--profile rig-play` is refused and nothing
lands in `/tmp/folded` — which is the row above it in §9.2's table, working. Take
that candidate from the **default** profile, where `A39` reads `PROF` and the
artifact is written — a profile selects which assertions apply and not what is
emitted, and on this rig the two profiles write a `skeleton.json` and a
`skeleton.atlas` that are identical byte for byte.

**No run reproduces this:** the three commands above read a build directory and two `/tmp` paths this repository does not track, so no gate reaches them; re-taken by hand against a render of the good build

| Candidate | MAE mean | worst | at |
| --- | --- | --- | --- |
| the build the frames came from | **0.00** | 0.00 | — |
| (a) one band inverted | **0.20** | 0.38 | **f0016** |
| (b) mesh folded | **2.07** | 3.66 | **f0016** |

⭐ **Both defects land on `f0016`, which is the frame the turn arrives on** — the
`worst at` column points straight at the moment, which is what makes this worth
running at all.

🚨 **And now the three limits, because this is the instrument you will be tempted
to call an audit:**

1. **It is differential.** It measures a candidate against **a render of another
   build**, so it catches a *regression* and cannot validate a *first authoring*.
   There is no reference for a face nobody has drawn yet.
2. **A wrong projection is a whisper in the aggregate.** Inverting a whole band —
   the far edge stretching to **1.363** where it should compress to **0.637**, so
   the head's own edge turns the wrong way — moves the mean MAE by **0.20 of
   255**. Nothing about that number says *"the winding"*; you have to already
   suspect it.
3. **The `slot drift` column cannot see it at all.** It was `1.2 px "lid_r"` in
   **all three** runs above, unchanged, because drift is attributed per **slot**
   and a folded head mesh is entirely inside one slot.

📌 **`explain`'s `DEFORM` block (§9.2, AUTHORING §4.11.2) takes half of limits 1
and 2 away, and none of limit 3.** It is reference-free, so it says something
about a first authoring; and it is *per key and per triangle*, so the band
inversion above reads as `x1.362834` on `tri 1` where the same band is `x0.637174`
in the model, rather than as 0.20 of 255 in an aggregate. What it still cannot say is whether **12° was the angle the shot
wanted** — that needs the picture, which is why the procedure below survives the
block as it survived `A39`.

📌 **`explain`'s `MEMBER` block (§3.1, AUTHORING §4.5.2) does the same for the
bone half, and it takes the **nose test** off the procedure below.** §3 makes the
nose the diagnostic — *if the nose's residual is not negative, the depths are
wrong* — and the block prints the six residuals in a column with the depth that
produced each one, so the check is reading one sign. ⚠️ It still cannot say
whether the **depth** was right: `nose at depth 192` evaluates as consistently
wrong as it does right, and no reference frame separates a plausible depth table
from the intended one.

⇒ **So the honest procedure — thinner for `A39` and the two report blocks, and
still a procedure, because none of the three limits above is one they
lift:** state the model on the key rather than deriving a table (§1.1 for the
mesh, §3.1 for the bones), so what a reviewer reads is a radius, an angle and a
depth per part; read the **nose's sign** off the `MEMBER` block and check the
**fold angle** (§4.2's formula) arithmetically before you build — the second is
still yours, and a stated model evaluates a wrong radius as consistently as a
right one — then render, **look at three scales**, and keep a render of the last
build you trusted so `check` has something to be differential against.

📌 **What §1.1 and §9.2's block make readable, and what neither does.**
`explain` prints the model beside the offsets it produced, so *what a key claims* is readable; the `DEFORM` block prints what the
key **did** — the area and stretch extremes, the displacement and the winding —
so *what the claim came to* is readable too, per key and with no reference
(`A39` catches the fold inside it). *Whether the claim is right* is not: **nothing
measures whether 12° was the angle the shot wanted**, and nothing above is a
substitute for looking at three scales.

---

## 10. The worked example

[`gallery/portrait`](https://github.com/rig-c/core/tree/main/gallery/portrait)
is this page on real art — **22 parts, 27 bones, 22 slots, 2 meshes, 40
vertices**, three animations, and a README that derives every number rather than
listing it. Its
[`FINDINGS.md`](https://github.com/rig-c/core/tree/main/gallery/portrait/FINDINGS.md)
is the measurement half: what it cost, the seven-angle sweep, the five tool gaps
it filed.

📘 **The `pitch` has its own worked case**, and this page deliberately stays a
yaw: [`gallery/nod`](https://github.com/rig-c/core/tree/main/gallery/nod) is
the same two closed forms on the other axis, plus a travelling `wave` (AUTHORING
§4.11.1). §4.2 and §5 above point at the two places its figures are worth
reading beside these — the fold angle bracketed against `A39`, and a
foreshortening span that is wider at the same angle.

```bash
bun install                                     # once

bun cli.ts build   --rig gallery/portrait/rig.json \
                   --motion gallery/portrait/motion.json \
                   --out gallery/portrait/build
bun cli.ts render  --candidate gallery/portrait/build --fps 25 --max 640 \
                   --out gallery/portrait/render
bun cli.ts preview --candidate gallery/portrait/build \
                   --out gallery/portrait/preview.html

# do the cycles close on the poses they opened with?
bun gallery/loop_seam.ts gallery/portrait/render/idle@25fps
bun gallery/loop_seam.ts gallery/portrait/render/gaze@25fps
bun gallery/loop_seam.ts gallery/portrait/render/turn@25fps
```

`build`, `render` and `preview` are not committed; the specs and the 22 part PNGs
are, and those commands regenerate the rest. **The frames to look at:**

| Frame | What it is |
| --- | --- |
| `render/turn@25fps/f0016.png` | the yaw arrives. **Look at this one at 1:1** — a contact sheet cannot show you whether the face turned or merely slid |
| `render/turn@25fps/f0000.png` | rest, for the comparison. The pair is the whole example |
| `render/idle@25fps/f0028.png` | the blink, shut |
| `render/gaze@25fps/f0015.png` | the gaze, held |

**What those commands print** — re-run verbatim for this page, from a checkout
with no `build/`, `render/` or `preview.html` in that directory. The `build`
says it in its own words, and these are the four lines this page's claims about
it come off:

```
  MESH  head         authored 25 vertices / 32 triangles  (budget 32)  bones=[head]  attachments=[head]  covers 100.00% of the art, reaching 95.90px past it
  MESH  hair_bang    authored 15 vertices / 16 triangles  (budget 32)  bones=[bang]  attachments=[hair_bang]  covers 100.00% of the art, reaching 55.22px past it
  ..    validate (spine-core round trip + machine assertions, profile spine)
  ..    profile spine — 6 renderer-policy and 8 archetype assertion(s) do not apply
```

`spine` is the default, so that is the `build` above with no `--profile` on it —
the report names what the profile leaves out rather than this page counting it.
§9.2 runs the same rig under `--profile rig-play` and quotes what comes back
there; `A13_MESH_BUDGET` and `A15_IDLE_NO_MESH_BONE_KEYS` are among the rules
the default profile excludes.

**No run reproduces this:** the three rows below come from commands that read the build directory this repository does not track, so no gate reaches them; re-taken by hand from a clean `gallery/portrait`

| Command | What came back |
| --- | --- |
| `render --fps 25 --max 640` | **81 + 39 + 56 frames**, 478×640, three contact sheets |
| `loop_seam.ts` ×3 | **0 / 255**, **0 of 305 920 pixels** differing, for all three |
| `preview` | one **414.5 KiB** HTML file, 22 pages embedded as data URIs — the figure the tool prints |

📊 **Figures this page took from the record rather than re-deriving**, because
they need the artifact's own pixels: the blink's occlusion (hiding the whole eye
assembly at the shut hold changes **0 of 305 920** pixels; positive control at
rest moves **8 183**), the per-edge narrowing displacements, the `spine-core`
agreement of every posed column and scale with §1's line to **under 0.001 px**,
and the Web Player interop pass (**0 console errors, 0 page exceptions**).
`setup: { "slot": null }`, the obvious way to hide one slot, is a named
`rigc compile error` that gives the spelling. Measured on a copy of this
example's `motion.json` carrying one such entry, with the path the run echoes
shortened and the line wrapped:

```
rigc compile error: motion.json: `setup."eye_l"` is null; a setup entry is an
object of `{ attachment?: string | null, color?: [r, g, b, a] }` — to show
nothing there write `"eye_l": { "attachment": null }`, and to show an attachment
write `"eye_l": { "attachment": "<name>" }`
```

⚠️ **And the second refusal says where that edit goes.** Writing the spelling that message names on a slot this rig
gives an attachment to is refused in turn — `slot "eye_l" has a setup attachment
in the rig spec AND in the motion spec; the setup pose has one author` — so on
the worked example hiding one slot is an edit to the **rig** spec rather
than a line in the motion spec.

⭐ **Vela is a second cast member and that was deliberate**, against the gallery's
own rule that its examples share one drawing. A 2.5D turn reads off four things: a
brow that frames an eye, an **iris and a highlight as separate parts**, hair in
**layers** that can lag the skull, and a cheek-to-jaw silhouette with a landmark
in it to foreshorten. The gallery's mascot has a muzzle, and a muzzle points
wherever the head points — so a mascot's turn is a bone rotation and nothing
else, which is precisely the move this page is not about. ⇒ **If the art you were
handed has no landmark to foreshorten, a turn will not read no matter how the
mesh is built**, and that is worth saying to the user before you build it.

---

## 11. Non-goals — stated, so nobody proposes them as gaps

🚫 **No command generates a turn, and neither model construct is one.**
§1 is one line of arithmetic; a `rigc yaw --degrees 12` would be guessing at
every depth in §2 on the user's behalf, and depth is the parameter the *author*
is choosing. Both constructs are the other thing — **a way to say the model in
the spec** (§1.1 for the mesh, §3.1 for the bones) — so the radius, the angle and
**every depth** arrive from the author and the compiler only evaluates. Neither one generates an in-between
either: a model is evaluated at one key, and sweeping an angle is editing one
number per key. What the toolchain owes is that the file is checkable,
that you can look, and that a person can choose.

🚫 **No pass bar for a face, and nothing here to hang one on.** MOTION.md's
banner applies unchanged: `build` says a file is valid, `render` and `preview`
let you look, `vote` lets a person choose. The angles in §8 are where a
construction **stopped reading for one viewer looking at one drawing**, not
thresholds.

🚫 **No claim that 12° is the right angle for any request.** It is the angle the
worked example ships, chosen to sit comfortably inside a 5-column grid's
17.65° tangent limit. §4.2 is how to pick your own, and picking it **first** is
the entire point of that section.

⚠️ **Not a Live2D comparison, and not a recommendation between formats.** What
the worked example measured is that a portrait turn is authorable on plain Spine
4.3 at draft quality — nothing outside the format, no plugin, no runtime patch —
and that the **split is authoring cost rather than runtime capability**. Neither
the deform table nor the track table is transcribed (§1.1, §3.1), so the
remaining cost is not on the keyboard but on the **parts**: per-eye meshes, a meshed neck, a
second art layer for the far cheek (§8). Whether to pay *that* is a project's
decision and this page does not make it.

🚫 **No Live2D file is read or written, and none ever will be — a boundary
rather than an unbuilt feature, and it runs in both directions.** rigc's inputs
are a rig spec and a motion spec; its outputs are Spine 4.3 skeleton data and an
atlas. There is no importer, no exporter and no converter for `.moc3`, `.cmo3`,
`.model3.json` or anything else in that family, and nothing in this repository
claims compatibility with that format in either direction.
⭐ **What is in scope is an authoring idea, stated on its own terms rather than
as anybody's feature: that a face angle can be a value rather than a time.**
§8's *The turn as a value rather than a time* is that idea on Spine's own
`slider` constraint, and every mechanism under it is Spine's — the arithmetic,
the flags, the readers and the failure modes are all in AUTHORING §3.5.2 and all
measured against `spine-core`. ⚠️ Nothing on this page is a statement about how
any other tool works inside, and nothing above implies one: what this repository
has measured is its own format.

🚫 **No per-eye mesh recipe.** §8 says the eyes need their own deform meshes past
about 26°, and nobody has built that here. The column-placement arithmetic in
§4.2 applies to any grid over any curved patch, so the tangent limit is the part
that carries over; **what a lash line and a wrapping lid need is unmeasured, and
this page does not guess.**

🚫 **No expression system, no visemes, no phoneme mapping.** A face that *acts* is
a different document and a different measurement. Everything here is one head
turning, blinking and looking — and the one general lesson that might carry into
that work is §7's: **allocate the channels before the first key, because Spine
blends and does not add.**

### A measured alpha aperture

A named socket plate can supply an `alphaClip` clipping attachment (AUTHORING,
**Alpha-derived clipping**). This also accepts a generated grid/contour source
with a depth sheet: the clip is carried by the source's UV/setup bindings and
sampled depths, independent of the clip slot's own bone. Give source and clip
explicit matching existing depth-yaw transform keys; a weight does not inherit
another attachment's deformation. Source-triangle crossings become clip vertices
and count against the declared budget. Do not replace this turn with a cosine-only
stand-in, fill a source hole, or infer threshold/tolerance from an appearance.

`tools/alpha_clip_proof.ts --out <evidence>` builds a controlled painted ellipse
and measures four gazes at yaw ±15°, with separate threshold/soft-edge error and
source-boundary checks beside core/SkeletonClipping pixel parity. Fixed framing
prevents a shifted clip from being hidden by automatic crop changes. These are
controlled CPU-render/geometry observations when actually run; they do not certify
production art, editor operation or browser/GPU playback. The actual editor trip
must preserve the clip's end, bindings and nonempty per-state render figures too.
