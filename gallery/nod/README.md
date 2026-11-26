# `nod` — a mesh built for the model that bends it

Lepus bows her head and her lop ears ripple. Three of the ten parts here are
meshes, and **each of the three was laid out for the one closed form that moves
it** — the head plate for a `pitch`, the two ears for a `wave`.

**Stars:** the two `transform` / `derive` kinds that shipped with controls and no
worked case — `pitch` on **both** of its surfaces (a `deform` key's `transform`
and a group track's `derive`) and `wave` on a mesh that can actually carry one.

📌 **Two kinds in one example, and the gallery bar says a second feature is a
second example — so here is the defence.** They are not two features. They are
the two remaining members of one construct ([AUTHORING §4.11.1](../../docs/AUTHORING.md)),
and the thing the example is *about* is the sentence they share: **a deform model
is only ever as good as the triangulation under it.** `pitch` is the half of that
statement with a **ceiling** — a fold angle you can compute before you author —
and `wave` is the half with a **proof**. Splitting them would have produced two
READMEs each making half an argument, and a second drawing of the same character
to make it with.

That sentence is the inverse of [#313](https://github.com/rig-c/core/issues/313),
which `flex` records from the other side: a leaf whose mesh was traced for its
*outline* could not carry a ripple at **0.5 px**, and the repair was to change the
model rather than the amplitude. Here the model came first and the mesh was drawn
to it, so the numbers below are the ones that fall out when you do it in that
order.

## Run it

From a checkout of this repository (`rigc <cmd>` if you have the package
installed — the flags are the same):

```sh
bun cli.ts build   --rig gallery/nod/rig.json --motion gallery/nod/motion.json --out gallery/nod/build
bun cli.ts explain --rig gallery/nod/rig.json --motion gallery/nod/motion.json --out gallery/nod/build
bun cli.ts render  --candidate gallery/nod/build --out gallery/nod/render --fps 12 --max 640
bun cli.ts preview --candidate gallery/nod/build --out gallery/nod/preview.html
```

`build` gates green under both profiles — `--profile spine` (the default) and
`--profile rig-play` — with **no declared exemption**. Nothing built is
committed; the three output paths above are in `.gitignore`.

To redraw the art (needs `rsvg-convert` from librsvg — `brew install librsvg`,
`apt install librsvg2-bin`):

```sh
bun gallery/nod/make_parts.ts
```

**Authored at 12 fps**, and `idle` frame 11 is the one to look at (`t = 0.917`,
just past the bob's extreme at 0.9): the face has dropped inside the skull's own
outline, and the ears carry mirror-opposite S-bends because they are half a
period apart. That is the frame where the ripple is unmistakably a travelling
wave rather than a lean. `bow` frame 2 is the second one — the −4° anticipation,
where the chin band opens and the features ride *up* before the nod.

## The two animations

| Animation | Duration | Loops | What it is for |
| --- | --- | --- | --- |
| `idle` | 2.0 s | yes | One breath, a 5° bob, and a ripple that never stops travelling. Nine `wave` keys per ear at 45° of phase each, so 360° lands exactly on the duration |
| `bow` | 1.8 s | no | A 12° nod, **anticipated at −4°**, held and released — the angle the fold-angle table below is about, and the ears trailing it by 10 % of the duration |

Both start from the same geometry, so they chain: `bow`'s first and last `wave`
keys are phase 0 and 360 on the left ear and 90 and 450 on the right, which are
`idle`'s own opening numbers.

## Which surface each kind uses, and why

`pitch` exists in **two** places in the format and this example uses both,
because the two halves of a nod are two different objects:

| The moving thing | Surface | Why that one |
| --- | --- | --- |
| the **head plate** — one drawing whose ink has to redistribute vertically | a `deform` key's `transform` ([§4.11.1](../../docs/AUTHORING.md)) | the plate is one rigid PNG. Nothing but its own vertices can compress the chin band and open the crown band, and no bone transform produces a *gradient* across one part |
| the **features** — five rigid parts sitting on that plate at five heights | a group track's `derive` ([§4.5.1](../../docs/AUTHORING.md)) | each one moves as a whole. A vertex model would need five one-vertex meshes; what they actually need is one number each, and the only free parameter in that number is a **depth** |
| the **ears** — two swinging parts | neither: an ordinary `v` map | their swing is a judgement, not a projection. See *The two spellings*, below |

`wave` has only one surface — it is a `deform` `transform` kind and there is no
`derive wave` — and that is the right shape: a ripple is a *shape inside one
part*, so there is nothing per-member for it to say.

## The `pitch` half: a grid whose rows are the interesting axis

```
head       320 × 300 plate, R = 150
  2 columns × 5 rows = 10 vertices, 8 triangles
  columns  x = −152, 152
  rows     y = 140, 105, 0, −105, −140
  z = √(R² − y²)
```

Two decisions in that block, and both are [FACE §4](../../docs/FACE.md)
transposed onto the other axis.

**Two columns, because a pitch moves nothing horizontally.** FACE §4 says a yaw
leaves the rows along for the ride; the same sentence about a pitch says the
*columns* are, so two is all a quad grid needs. `portrait`'s 5 × 5 head spends 15
vertices on rows a yaw never reads; this grid is the transpose with that spend
removed, and `explain` prints the consequence — the two vertices of a row take
the **same** offset. The list walks the outline (down the right side, back up the
left), so the top row is `v 0`/`v 1` and every row below it pairs `v r` with
`v 11−r`:

```
      t=0.6     deform[0..20]  10 pair(s)                      stepped
               transform pitch  radius=150 degrees=12
               dy = (y−about)·(cos t − 1) − z·sin t,   z = √(radius² − (y−about)²)
                 t = 0.20944 rad
                 cos t − 1 = -0.021852
                 sin t = 0.207912
                 centre shift = −radius·sin t = -31.186754
               10 vertices, largest offset 31.186754px at vertex 3
                 v  0 (0, -14.255723)  v  1 (0, -14.255723)  v  2 (0, -24.5663)  v  3 (0, -31.186754)
                 v  4 (0, -19.977295)  v  5 (0, -8.137051)  v  6 (0, -8.137051)  v  7 (0, -19.977295)
                 v  8 (0, -31.186754)  v  9 (0, -24.5663)
```

**Uneven rows, dense at the crown and the chin.** `−140, −105, 0, 105, 140` puts
the resolution where a cosine's variation is, which is at the silhouette. What
the grid does to the drawing is a non-uniform **vertical** redistribution
(**derived**, from the offsets above):

| Band, from the crown | Rest height | At 5° | At 12° |
| --- | --- | --- | --- |
| 140 → 105 | 35.0 | ×1.128845 | **×1.294589** |
| 105 → 0 | 105.0 | ×1.031786 | ×1.063052 |
| 0 → −105 | 105.0 | ×0.960603 | ×0.893243 |
| −105 → −140 | 35.0 | ×0.863544 | **×0.661708** |

⭐ **Those eight figures are also what the instrument measures, and the two
agree to the last digit printed.** The table is arithmetic on the row positions;
`explain`'s `DEFORM` block ([§4.11.2](../../docs/AUTHORING.md)) is a signed area
ratio taken off **posed float32 world vertices** at each key. Nothing connects
them but the geometry:

**No run reproduces this:** the two `area` lines of two different animations, each abridged out of its own DEFORM record
```
  DEFORM  idle  default/head/head  key 1  t=0.900000  transform pitch  radius=150 degrees=5
          area       min x0.863544 tri 6   max x1.128845 tri 0   (8 triangles, 0 with no area at the cleared pose, band 0.092526px²)
  DEFORM  bow  default/head/head  key 2  t=0.600000  transform pitch  radius=150 degrees=12
          area       min x0.661708 tri 6   max x1.294589 tri 1   (8 triangles, 0 with no area at the cleared pose, band 0.090573px²)
```

⇒ **The chin band compresses to 66 % and the crown band opens to 129 %.** That
gradient is what makes it read as a nod instead of a slide, and it is the whole
reason the skull is drawn as a tapering path rather than an ellipse: an ellipse's
crown and chin carry no landmark for the gradient to act *on*.

### The fold angle: derived, then measured

A row at `y` sits at depth `z = √(R² − y²)`. Two adjacent rows swap order — the
mesh turns inside out — at

```
                      Δy      y₁ − y₂
       tan θ_fold  =  ──  =  ─────────        over ADJACENT rows
                      Δz      z₁ − z₂
```

and a grid folds at the **minimum** of that over its pairs. Reproduce every
figure below with:

```sh
bun -e '
const R = 150, z = (y) => Math.sqrt(R*R - y*y), deg = (r) => r*180/Math.PI;
const fold = (rows) => { let best = [Infinity, null];
  for (let i = 0; i + 1 < rows.length; i++) { const a = deg(Math.atan((rows[i]-rows[i+1])/(z(rows[i])-z(rows[i+1]))));
    if (a > 0 && a < best[0]) best = [a, [rows[i], rows[i+1]]]; } return best; };
for (const rows of [[140,105,0,-105,-140], [140,125,105,0,-105,-125,-140], [140,133,105,0,-105,-133,-140],
                    [140,133,125,105,0,-105,-125,-133,-140], [140,112,84,56,28,0,-28,-56,-84,-112,-140]]) {
  const [a, p] = fold(rows); console.log(rows.length + " rows folds at " + a.toFixed(4) + " deg, pair (" + p + ")"); }
console.log("tangent limit at the outer row: " + deg(Math.atan(z(140)/140)).toFixed(4) + " deg");
for (const t of [12,16,21,26]) console.log("thetaMax " + t + " deg -> outer row at " + (R*Math.cos(t*Math.PI/180)).toFixed(3));
'
```

| Rows | Folds at | The pair that folds |
| --- | --- | --- |
| 5 — `±140, ±105, 0` (shipped) | **33.3062°** | `−105, −140` |
| 7 — `±125` added | 27.2984° | `−125, −140` |
| 7 — `±133` added | **24.2911°** | `−133, −140` |
| 9 — `±133, ±125` added | **24.2911°** | `−133, −140` |
| 11 — uniform, every 28 | 31.3685° | `−112, −140` |
| continuous limit at `y = −140` | **21.0395°** | — |

🚨 **A denser grid is not a safer grid, and the 7- and 9-row rows are the proof
that it is the outermost gap and not the count.** They fold at *exactly* the same
24.2911°, because both contain `(−133, −140)` and the extra `±125` row changes
nothing. Counting vertices tells you nothing about this failure; look at the
outermost two rows.

⭐ **So the row position is not tuned — it is solved.** Put the outer row at

```
|y|outer = R · cos θmax        ⇒  its tangent limit is EXACTLY θmax
```

| θmax you want | Outer row at |
| --- | --- |
| 12° | 146.722 |
| 16° | 144.189 |
| 21° | **140.037** |
| 26° | 134.819 |

This example picked **21°** first and got 140.037, which is why the shipped rows
are at `±140` and not at some rounder number. It ships a 12° nod against a
21.0395° tangent limit and a 33.3062° fold — a ceiling twice the angle in use.

**And now measured, from the other side.** `A39_DEFORM_KEEPS_TRIANGLE_WINDING`
reads posed geometry and knows nothing about the formula above, so bracketing the
angle at which it fires is an independent check. The green side of the bracket:

```sh
sed 's/"degrees": 12/"degrees": 33/g' gallery/nod/motion.json > /tmp/nod-33.json
bun cli.ts build --rig gallery/nod/rig.json --motion /tmp/nod-33.json --out /tmp/b33 --profile rig-play   # green
```

`33°` gates green; `34°` does not, and the refusal names the pair the closed form
names:

**Reproduce it:** replace `"degrees": 12` with `"degrees": 34` in `gallery/nod/motion.json`, then run `build --profile rig-play`.
```
FAIL  A39_DEFORM_KEEPS_TRIANGLE_WINDING: animation "bow" deform head/head key 2
(t=0.6000000238418579s): 2 of 8 triangle(s) reverse winding — triangle 6 [7,6,5] 5320.002 ->
-117.308px²; triangle 7 [7,5,4] 5320.002 -> -117.308px². The mesh has turned inside out there and
draws its texture backwards. Fix the key's offsets in the motion spec's deform timeline (a
projection past its fold angle is the usual cause — docs/FACE.md §4.2 has the closed form), or, if
this slot folds on purpose, declare it in the rig spec as invariants.deformMayFold: [{ "slot":
"head", "why": … }] (see rigc guide A39_DEFORM_KEEPS_TRIANGLE_WINDING)
```

Vertices 4–7 are rows `−105` and `−140`: the outermost gap, bracketing the
derived **33.3062°** to a degree. (Tighter than a degree needs a bisection, and
the selftest already runs one — `DW03_THE_ANGLE_A39_FIRES_AT_IS_THE_CLOSED_FORM_FOLD_ANGLE`
agrees with the same formula to 0.0001° on its own fixture.)

### What the features carry, and the one row to read first

`facebob` is a bone at the head plate's own origin that carries the shift every
feature shares, and each feature then keys only its residual — FACE §3's
shared-shift split, stated as one parameter. The bone track's `derive` takes one
depth and the group track's takes a depth per member:

```json
{ "bone": "facebob", "property": "translatey", "keys": [
    { "t": 0.6, "derive": { "kind": "pitch", "degrees": 12, "depth": 150 }, "ease": "swell" } ] }

{ "group": "features", "property": "translatey", "keys": [
    { "t": 0.6, "derive": { "kind": "pitch", "degrees": 12, "carried": 150,
        "depth": { "crown": 126, "eye_l": 132, "eye_r": 132, "snout": 176, "mouth": 144 } },
      "ease": "swell" } ] }
```

**The depths**, and what each one is doing. Every depth is measured against
`R = 150`, the skull surface at the centre of the face — which is a decision and
not a measurement, exactly as FACE §2 says:

| Part | `y` | depth | What the depth is |
| --- | --- | --- | --- |
| face centre (skull surface) | 0 | **150** | `R`. `facebob`'s own depth, and what `carried` names |
| `crown` | 120 | 126 | 24 **behind** the surface: the tuft lies back over the skull |
| `eye_l` / `eye_r` | 18 | 132 | 18 below. A socket is a hollow |
| `snout` | −44 | **176** | protrudes 26. The only part in **front** of the surface |
| `mouth` | −80 | 144 | 6 below. Almost on the surface |

`explain`'s `MEMBER` block ([§4.5.2](../../docs/AUTHORING.md)) prints the column,
which is the arrangement the audit needs:

```
  MEMBER  bow  group "features".translatey  t=0.600000  5 member(s)  derive pitch  degrees=12 carried=150  -> the displacement
          dy = (y−about)·(cos t − 1) − (depth − carried)·sin t
            t = 0.20944 rad
            cos t − 1 = -0.021852
            sin t = 0.207912
            shift the parent carries = −carried·sin t = -31.186754
            crown       2.367593  <-  120 at depth 126
            eye_l       3.349067  <-  18 at depth 132
            eye_r       3.349067  <-  18 at depth 132
            snout      -4.444198  <- -44 at depth 176
            mouth       2.995662  <- -80 at depth 144
```

⭐ **The snout is the row to read first, and it is FACE §3's nose diagnostic on
the other axis.** It is the only **negative** residual, because it is the only
part in front of the surface: it protrudes 26, and `26 · sin 12° = 5.406`… which
is *not* −4.444, and the gap is the point. The residual is
`y·(cos t − 1) − (depth − carried)·sin t`, so the snout's own height off the axis
(`−44`, contributing `+0.961`) is netted against its stand-off (contributing
`−5.406`). ⇒ **On a pitch the diagnostic is the sign and not the magnitude**: if
the snout's residual is not negative, the depths are wrong. Every residual is
between 2.4 and 4.5 units against a shared shift of 31.2, which is FACE §3's
whole argument for the split — nobody can eyeball a wrong sign in a 31, and
everybody can in a 2.4.

### 🚨 A pitch foreshortens harder than a yaw on the same face, and the reason is the drawing

The other half of a turn is the narrowing, `scaleY = cos(α − t)/cos α` with
`α = atan2(y, depth)`. At the same 12° this face gives:

| Part | `α` | `scaleY` at 12° | `portrait`'s comparable |
| --- | --- | --- | --- |
| `crown` | 43.59° | **1.176159** | — |
| `eye_l` / `eye_r` | 7.77° | 1.006499 | 0.8922 / 1.0641 |
| `snout` | −14.04° | 0.926170 | 0.9781 (`nose`) |
| `mouth` | −29.05° | **0.862641** | 0.9781 (`mouth`) |

`portrait`'s six features span **0.892 … 1.064**; these five span
**0.863 … 1.176**, from the identical closed form at the identical angle. ⇒ **It
is not the model, it is the axis.** A face is taller than it is wide, so its
features spread further along `y` than along `x`: `portrait`'s eyes sit at
`x = ∓62` against `R = 170` (a ratio of 0.36), and this crown sits at `y = 120`
against `R = 150` (0.80). `α` is what that ratio becomes, and `cos(α − t)/cos α`
is steepest where `α` is largest.

⚠️ **Practical consequence, and it cost an iteration here.** A part high on the
face takes a *visible* vertical stretch from a modest nod, so the parts to put
there are ones whose height is not a shape you can be wrong about. The crown is a
tuft of fur and stretching it 18 % reads as fur; the first pass had it drawn *in
front* of the head plate, where the same 18 % moved a hard ink line across the
forehead and read as a hat sliding about. It is now drawn **behind** the plate,
so only the 27 units that clear the skull's own outline are ever in the picture.
That is FACE §5's iris finding in its general form: **a projection is only as
honest as the part it is applied to.**

⚠️ **What has no analogue here.** FACE §5's counter-scale — the reciprocal that
keeps an iris circular under a yaw — buys a measured 8° of extra range on that
example and buys **nothing** here, because this face has no part whose shape is a
circle a viewer knows. The eyes are drawn into their own plates and take
`1.006499`, which is within a rounding of doing nothing. So this example ships no
counter-scale, and the absence is a decision rather than an omission.

## The `wave` half: a strip built so that no amplitude can fold it

```
ear_l, ear_r    112 × 420 plate
  2 columns × 11 rows = 22 vertices, 20 triangles
  columns  x = −50, 50
  rows     y = 0, −40, −80, … , −400            ← uniform, 40 apart
  the slot bone is at the ROOT (y = 0), not at the plate's centre
  wave:   along y, axis x, wavelength 320, amplitude 8–16
```

Three decisions, and the middle one is the whole finding.

**Uniform rows, which is the opposite of the head's.** The head's rows are dense
at the silhouette because a cosine projection's variation piles up there. A
sinusoid's does not: `d/dy [A·sin(ky)] = A·k·cos(ky)`, whose envelope is `A·k`
*everywhere* along the strip, so no stretch of it carries more variation than any
other. ⇒ **The sampling follows the model's own derivative**, and for a wave that
means even spacing. Reaching for FACE §4.1's
uneven columns here would put resolution where a wave has no more to say than
anywhere else.

**The slot bone is at the root.** So the mesh's `y` runs 0 at the skull to −400
at the tip and the wave's `along` coordinate *is* "how far down the ear a vertex
is". A plate centred on its own bone would have made that coordinate an offset
from the ear's middle, and every `phase` in `motion.json` would have been
measured from a place nothing happens.

**Quads split along the rows, no fan apex — and that is a proof, not a margin.**
Every triangle in this grid joins two vertices of one row to one vertex of the
next — the list walks the outline (down one side, back up the other, so that
Spine's `hull` can be read off it; [AUTHORING §3.4](../../docs/AUTHORING.md)) and
the triangles carry the row structure — so **every triangle has two vertices in
the same row**. A wave that reads `y` and displaces
`x` maps `x → x + f(y)` with `y` untouched, and for a triangle whose vertices
`1` and `2` share a row the signed-area change is

```
Δ2A = (f₂ − f₁)(y₃ − y₁) − (f₃ − f₁)(y₂ − y₁)
    = 0 · (y₃ − y₁)      − (f₃ − f₁) · 0        = 0        exactly
```

and the same cancellation holds whichever pair shares the row. ⇒ **No amplitude
folds this mesh.** `explain` shows the mechanism in the offsets — the two
vertices of each row take the same number, so each row slides rigidly (the list
walks the outline, so the entry row is `v 0`/`v 1` and every row below it pairs
`v r` with `v 23−r`):

```
      t=0       deform[0..44]  22 pair(s)                      linear
               transform wave  amplitude=10 wavelength=320 phase=0 along=y axis=x
               dx = amplitude · sin(2π·y/wavelength + phase)
                 2π/wavelength = 0.019635 rad per unit
                 phase = 0 rad
               22 vertices, largest offset 10px at vertex 3
                 v  0 (0, 0)  v  1 (0, 0)  v  2 (-7.071068, 0)  v  3 (-10, 0)
                 v  4 (-7.071068, 0)  v  5 (0, 0)  v  6 (7.071068, 0)  v  7 (10, 0)
                 v  8 (7.071068, 0)  v  9 (0, 0)  v 10 (-7.071068, 0)  v 11 (-10, 0)
                 v 12 (-10, 0)  v 13 (-7.071068, 0)  v 14 (0, 0)  v 15 (7.071068, 0)
                 v 16 (10, 0)  v 17 (7.071068, 0)  v 18 (0, 0)  v 19 (-7.071068, 0)
                 v 20 (-10, 0)  v 21 (-7.071068, 0)
```

### Measured: the amplitude sweep that never finds a bound

`flex` found its leaf's ripple ceiling by sweeping `amount` until `A39` fired.
The same sweep here, on every `wave` amplitude in the spec at once:

```sh
for a in 100 400 4000; do
  sed -E "s/\"amplitude\": [0-9]+,/\"amplitude\": $a,/g" gallery/nod/motion.json > /tmp/nod-amp$a.json
  bun cli.ts build --rig gallery/nod/rig.json --motion /tmp/nod-amp$a.json --out /tmp/b-amp$a --profile rig-play
done
bun cli.ts explain --rig gallery/nod/rig.json --motion /tmp/nod-amp4000.json --out /tmp/b-amp4000
```

| Amplitude | `A39` | The `DEFORM` block's area band | Its stretch band |
| --- | --- | --- | --- |
| 8–16 (shipped) | PASS | ×0.999999 … ×1.000001 | ×0.858698 … ×1.164554 |
| 100 | PASS | — | — |
| 400 | PASS | — | — |
| **4000** | **PASS** | **×0.999932 … ×1.000030** | **×0.014138 … ×70.724831** |

⇒ **At 4000 units of ripple on a 95-unit-wide ear, the drawing is stretched
seventy-fold and squashed to 1.4 %, and not one of the 20 triangles reverses.**
The two stretch figures multiply to 0.99971, which is what §4.11.2 means by
`σ₁·σ₂ = |area ratio|` — the map is a pure shear, so it has to hold. Compare
`flex`'s leaf, whose ripple was refused at **1 px**: same tool, same kind of
timeline, and the difference is entirely in how the triangles were built.

⚠️ **What the proof does *not* buy.** Winding is not legibility. The stretch row
is the one that says whether the drawing survives, and at 4000 it emphatically
does not — an ear stretched ×70 is a smear. `A39` staying green there is the
correct behaviour and it is also the reminder that A39 answers one question. The
shipped amplitudes take the drawing to **×1.164554** at `bow`'s peak of 16 (and
×1.092288 at `idle`'s 10), which is where an ink outline still looks like an ink
outline.

### 🚨 The failure this mesh *does* have: a wavelength its rows cannot sample

The rows are 40 apart, so the mesh can only carry a sinusoid the rows actually
sample. Reproduce — `80` now exits 1 on the `build`, so its `explain` has no
artifact to read and the refusal below is the whole output:

```sh
for wl in 80 160; do
  sed "s/\"wavelength\": 320/\"wavelength\": $wl/g" gallery/nod/motion.json > /tmp/nod-wl$wl.json
  bun cli.ts build   --rig gallery/nod/rig.json --motion /tmp/nod-wl$wl.json --out /tmp/b-wl$wl --profile rig-play
  bun cli.ts explain --rig gallery/nod/rig.json --motion /tmp/nod-wl$wl.json --out /tmp/b-wl$wl
done
```

| Wavelength | Rows per period | What the mesh does with it | Gate |
| --- | --- | --- | --- |
| 320 (shipped) | 8 | a sinusoid | green |
| 160 | 4 | `0, −A, 0, +A, 0, …` — a zigzag, not a curve | green |
| **80** | **2** | at phase 0, **nothing at all** | **refused** |

🚨 **A key that stated a 10-unit ripple, emitted an all-zero run, and gated green
under both profiles.** Every row lands on a zero crossing, so the model is
sampled to nothing. `A35` was satisfied (the run fits), `A39` was satisfied (no
triangle moved), and the only thing in the toolchain that said so was `explain`'s
`moved 0 of 22 vertices` line — which is the sentence AUTHORING §4.11 uses for a
`{ "t": … }` key with no run at all, a deliberate construct. A key that stated a
model and lost it is not the same event.

⭐ **It is a refusal now** ([#350](https://github.com/rig-c/core/issues/350)),
and the row above is what the compiler says instead:

Its own path to the patched motion spec sits between `error:` and `animation`
and is cut here, because it is a different string on every machine:

**Reproduce it:** replace `"wavelength": 320` with `"wavelength": 80` in `gallery/nod/motion.json`, then run `build --profile rig-play`.
```
rigc compile error: animation "idle" deform default/ear_l/ear_l (t=0): transform wave states
amplitude=10 wavelength=80 phase=0 along=y axis=x, and every one of this attachment's 22
vertices evaluates to an offset of 0 — the largest value the closed form reached at any of them
is 1.225e-14, which quantises to 0 on the 1e-6 grid a model is evaluated on. So the key
states a deformation and emits the identity, and nothing downstream can tell it apart from a
key that meant the setup pose. The closest two distinct y coordinates in this attachment are 40
apart, and a sinusoid has to be sampled to exist: a wavelength of at least 4x that (160) to
read as a wave at all and 8x (320) to read as a curve, where this key states 2x. At 2x every
sample lands on the same pair of phases, and at the zero crossings that pair is (0, 0).
`gallery/nod`'s README carries that rule and the measured table behind it. A key that MEANS the
identity states it in its own parameters (amplitude 0) or carries no run at all. (see rigc guide CE_DEFORM_TRANSFORM_QUANTISED_IDENTITY)
```

📌 **The 160 row is still green and that is deliberate.** A zigzag is a *bad*
wave rather than an absent one, so it belongs to authoring judgement and not to a
refusal — which is why the arithmetic below is still the rule to author by rather
than something the compiler now enforces for you:

⭐ **`wavelength ≥ 4 × row spacing` to get a wave at all, `≥ 8 ×` to get a
curve.** This mesh's 40-unit rows against a 320 wavelength give 8, and the strip
spans 400 units, so 1.25 periods are visible — enough that the crest and the
trough are on the ear at the same time, which is what reads as *travelling*
rather than *flapping*.

### The travelling wave is one number per key

`phase` is the only parameter that moves in `idle`: nine keys, 45° apart, 0
through 360.

```json
{ "t": 0,    "transform": { "kind": "wave", "amplitude": 10, "wavelength": 320, "phase": 0,   "along": "y", "axis": "x" } },
{ "t": 0.25, "transform": { "kind": "wave", "amplitude": 10, "wavelength": 320, "phase": 45,  "along": "y", "axis": "x" } },
…
{ "t": 2,    "transform": { "kind": "wave", "amplitude": 10, "wavelength": 320, "phase": 360, "along": "y", "axis": "x" } }
```

Three things that spelling decides:

**The loop closes by construction.** `sin(θ + 2π) = sin θ`, so the t = 0 and
t = 2 keys evaluate to the same 44 numbers and the seam is a property of the
arithmetic rather than of a hand-matched pair of tables.

**No easing on the ripple keys.** A travelling wave moves at constant speed. A
`bezier` on each key would make the crest hesitate at every key it passes,
twice per period. This is the one place in the example where *linear* is the
considered choice and not the default nobody set — `explain` prints `linear` on
those keys and that is what it should say.

**The two ears are one drawing and two timelines.** `ear_r` starts a quarter
period behind (`phase 90`) and at a smaller amplitude (8 against 10). Without
that they are the same animation played twice, side by side, and a viewer sees
it immediately.

⚠️ **The root moves, because a `wave` has no taper.** The root row is at `y = 0`,
so its offset is `amplitude · sin(phase)` — up to the full amplitude, 16 units at
`bow`'s peak. The fix is in the **art**, which is the same place `flex` put the
fix for its hinge wedges: the ear's root is its narrowest part — 43 units of ink
across, from bone `x = −20.5` to `+22.5` — and it is drawn behind the head plate
at head-local `x = ∓76`. Evaluate the two
paths `make_parts.ts` states and the margin is 7.66 units at every phase:

```sh
bun -e '
const P=[[160,19],[88,19],[30,60],[25,126]];                       // the skull, left of the crown
const at=(t,i)=>{const u=1-t;return u*u*u*P[0][i]+3*u*u*t*P[1][i]+3*u*t*t*P[2][i]+t*t*t*P[3][i];};
let lo=0,hi=1; for(let k=0;k<60;k++){const m=(lo+hi)/2; at(m,1)<70?lo=m:hi=m;}   // canvas y 70 = head-local y +80
console.log("skull reaches head-local", (160-(at((lo+hi)/2,0)-4.5)).toFixed(3));
for (const amp of [0,10,16]) console.log("root ink at amplitude", amp, "reaches",
  Math.max(...[35.5,78.5].map(cx=>{const b=cx-56, sh=b+(b<0?-amp:amp);
    return Math.abs(-76+sh*Math.cos(-14*Math.PI/180));})).toFixed(3));'
```

| | head-local reach |
| --- | --- |
| the skull's silhouette at the ears' height | **119.080** |
| the root row's ink at rest | 95.891 |
| at `idle`'s amplitude 10 | 105.594 |
| at `bow`'s peak amplitude 16 | **111.416** |

A tapering ripple would need a `bend` multiplied by a `wave`, and §4.11.1 states
one model per key on purpose.

## The two spellings of a per-member value, in one motion spec

[§4.5.1](../../docs/AUTHORING.md) lands two ways to give a group's members
different numbers, and the choice is *whether the numbers are decisions or
arithmetic*. This example uses both, twelve lines apart:

| Track | Spelling | Because |
| --- | --- | --- |
| `features` `translatey` / `scaley` | **`derive`** + a depth per member | `y·(cos t − 1) − (depth − 150)·sin t` at five heights is arithmetic. The only decisions in it are the five depths, and a `derive` key is what puts them in the file that uses them |
| `ears` `rotate` | a **`v` map** | `{ "earbase_l": [-7.5], "earbase_r": [6.5] }` is two judgements about how far a floppy ear swings, and they are not even the same magnitude — the left ear leads because the lamp is on that side and the asymmetry reads |

`explain` labels which is which, and that label is the whole audit:

**No run reproduces this:** two MEMBER lines lifted out of one `explain` run, which does not print them adjacent
```
  MEMBER  bow  group "features".translatey  t=0.600000  5 member(s)  derive pitch  degrees=12 carried=150  -> the displacement
  MEMBER  bow  group "ears".rotate  t=0.780000  2 member(s)  stated per member
```

⇒ **Forcing the ears into a model would have been a worse spec that happened to
use the newer field**, which is the trap FACE §5 flags about the iris
counter-scale. There is no depth that produces `−7.5` and `6.5`; there is a
person who watched a contact sheet.

## What the models replaced

| | Count |
| --- | --- |
| `deform` keys carrying a stated model | **32** (4 `pitch`, 28 `wave`) |
| vertex offsets those 32 keys emit | **1312** (head 80, each ear 616) |
| `derive` keys on bone and group tracks | **8** |
| per-member bone values those 8 keys emit | **44** |

Reproduce the first two:

```sh
bun -e '
const s = JSON.parse(await Bun.file("gallery/nod/build/skeleton.json").text());
let keys = 0, bare = 0, nums = 0; const per = {};
for (const a of Object.values(s.animations)) for (const slots of Object.values(a.attachments ?? {}))
  for (const [slot, atts] of Object.entries(slots)) for (const tl of Object.values(atts))
    for (const k of tl.deform) { keys++; if (!k.vertices) { bare++; continue; }
      nums += k.vertices.length; per[slot] = (per[slot] ?? 0) + k.vertices.length; }
console.log("deform keys", keys, "of which bare", bare, "-> stated models", keys - bare);
console.log("emitted offsets", nums, JSON.stringify(per));'
```

⚠️ **1312 is not the argument, and the anticipation is.** `bow`'s `−4°` lift is
one key on each of four tracks — 20 vertex offsets and 6 bone values — and
[FACE §1.1](../../docs/FACE.md) says outright that a hand-transcribed table
priced exactly that out of `portrait`: *"80 numbers for a tenth of a second"*.
The line count is a side effect; being able to afford a 0.18-second key is the
feature.

## What was verified, and what it cost

| Check | Result |
| --- | --- |
| `build --profile spine` | green — the run's own verdict is quoted below the table; 2 animations |
| `build --profile rig-play` | green — same, including `A39_DEFORM_KEEPS_TRIANGLE_WINDING` and `A15_IDLE_NO_MESH_BONE_KEYS`, both PASS |
| `A18_DETERMINISTIC_EMIT` | green on a second independent compile; the selftest's gallery suite compiles it three times |
| mesh coverage | **100.00 %** on all three meshes: nothing of any drawing is outside its triangles |
| `render --fps 12 --max 640` | 25 + 23 frames, looked at as contact sheets three times, plus 1:1 frames at the nod extreme, the anticipation and both ripple phases |
| `loop_seam.ts` | **0 / 255** on both animations, `idle` at 12 fps and `bow` at the 15 the tool named, at six `--max` sizes — the whole section below |
| `preview` | boots, 406.7 KiB with ten pages embedded |
| `bun run selftest` | green, with the two rows for this example being `GALLERY_EXAMPLE_IS_GREEN[nod/spine]` and `[nod/rig-play]`. Its summary says every gallery example compiled three times and gated green under **both** profiles |

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

**Mesh overshoot is large and is not a defect.** `head` reports
`reaching 67.88px past it` and each ear `33.12px`, because a rectangular grid over
a tapering shape has transparent corners — FACE §4.3's own case. **`covers
100.00%` is the figure that matters.**

**Three art passes, and each one was a contact sheet telling me something:**

1. the crown drawn in front of the head read as a beret; the ears were too narrow
   to show a ripple at 1:1; the mouth sat 24 units below the muzzle's cleft and
   read as a second mouth.
2. the crown moved behind the plate but its peaks were narrow, so the visible
   part was mostly ink and read as three dark nubs; the kerchief's knot read as a
   drip.
3. broad scalloped crown lobes, a 95-unit-wide ear, the mouth raised to `y = −80`
   — and a **crescent of empty plate under the chin**, which no assertion can see
   and which is only obvious once the head and the torso are in one frame. The
   chin's ink ended at world `y 344.5` and the old torso's began at `338.5`, so
   the gap was 6 units at the centre and widened at the sides where both curves
   fall away. The torso grew a neck (340 × 430, `torso` bone up from `y 165` to
   `y 190`) and it closed.

**One hypothesis tested and thrown away**, because it was nearly a README claim:
the float32 duration explanation for this example's scale-independent seam. See
*The loop joins* below — it is wrong, and the control that refutes it is one
rebuild.

### Defects and gaps this example found

| | |
| --- | --- |
| [#350](https://github.com/rig-c/core/issues/350) | ✅ **fixed** — a `deform` `transform` that evaluated to an **all-zero run** was not refused: a stated 10-unit `wave` at `wavelength 80` on 40-unit rows emitted nothing and gated green under both profiles. It is a `CompileError` now, and a key that *means* the identity states it in its own parameters |
| [#351](https://github.com/rig-c/core/issues/351) | `src/trackgen.ts`'s `depth` doc comment says *"Deeper is further from the viewer"*, which is the **wrong sign**: FACE §1 has `z` toward the viewer, and `portrait`'s own nose at `depth 192` against a surface at `170` is in front |
| [#352](https://github.com/rig-c/core/issues/352) | AUTHORING §4.11.1's and §4.5.1's *Worked case* columns still read `—` for `pitch` and `wave`, and the worked-example lists in §4.11, §4.11.2 and FACE.md do not mention this example |

Nothing in the compiler misbehaved. Both refusals this example leaned on —
`transform pitch has radius 150, and vertex N sits at y=…, which is … past it`
and `A39`'s named triangle pairs — said exactly what to change, which is the bar
[CLAUDE.md](../../CLAUDE.md) sets for a failure message.

## The loop joins, and the two things the reading is a reading *of*

⚠️ **A seam figure is a figure at one `--max` and at one frame rate**, and
`loop_seam.ts` now says both out loud
([#336](https://github.com/rig-c/core/issues/336),
[#337](https://github.com/rig-c/core/issues/337)). So:

```sh
bun cli.ts render --candidate gallery/nod/build --out gallery/nod/render --fps 12 --max 640
bun gallery/loop_seam.ts gallery/nod/render/idle --duration 2
```

```
loop seam  idle
  f0000.png vs f0024.png   25 frames at 569x640
  drawn at                 --max 640, 0.814471 px/unit  ⚠️ every figure below is a reading AT THIS SIZE (issue #336):
                           …
  sampled at               12 fps, last frame at t = 2.000000s = the 2s duration given
  max channel difference   0 / 255
  mean channel difference  0.0000
  pixels differing         0 of 364160 (0.000%)
  ⇒ the cycle CLOSES: the frame at the duration is the frame at t = 0, to the byte
```

Measured at six sizes, re-rendering each one:

| `--max` | Frame | px/unit | Pixels differing | Worst channel |
| --- | --- | --- | --- | --- |
| 320 | 284×320 | 0.407235 | 0 | 0 / 255 |
| **640** (the example's) | 569×640 | **0.814471** | **0** | **0 / 255** |
| 700 | 622×700 | 0.890827 | 0 | 0 / 255 |
| 1024 | 910×1024 | 1.303153 | 0 | 0 / 255 |
| 1050 | 933×1050 | 1.336241 | 0 | 0 / 255 |
| 1400 | 1244×1400 | 1.781655 | 0 | 0 / 255 |

### `bow` needed a different frame rate, and the tool refused the wrong one

`bow` is a one-shot that ends on the pose and the geometry it opened with, so it
has a seam worth reading — but `1.8 s × 12 fps = 21.6`, and at 12 fps the last
frame `render` writes sits at **1.833 s**, past the duration. Pointed at that
set, `loop_seam.ts` declines rather than printing a number:

```
loop_seam: this is not a seam measurement: bow's last frame is not at the duration.
  last sampled frame   t = 1.833333s   (23 frames at 12 fps, per …/render/frames.json)
  --duration says      t = 1.800000s
  it lands             PAST the end by 0.033333s = 0.400 of a frame at 12 fps   (tolerance 0.000001s)
  why                  render samples i = 0..round(d x fps) at 1/fps, so the last frame is at d exactly when d x fps is an integer. 1.8 x 12 = 21.6 is not.
  rates that do land   every multiple of 5 fps; the first at or above 12 is 15
```

⇒ **Re-rendered at the 15 fps it names**, `bow` reads **0 / 255, 0 of 364160
pixels differing** at `--max 640`, 28 frames, last frame at `t = 1.800000s`:

```sh
bun cli.ts render --candidate gallery/nod/build --animation bow --out gallery/nod/render --fps 15 --max 640
bun gallery/loop_seam.ts gallery/nod/render/bow@15fps --duration 1.8
```

📌 **That refusal is the reason the number is worth anything.** Before #337 this
example would have reported `bow` at **0 / 255** from the 12 fps set — the same
figure, arrived at by comparing `t = 0` against `t = 1.833`, which is not the
wrap point and therefore not a seam. It happened to be 0 because the final
segment is constant. A one-shot whose last key is *not* the end is where the same
mistake prints a wrong number instead of a right one for the wrong reason.

### One hypothesis tested and thrown away

Recorded because it was nearly a finding. `portrait`'s `idle` seam is
scale-sensitive (#336's table) and this one is not, at six sizes, and the
tempting explanation was float32 key times: `Math.fround(2)` is exactly `2` where
`Math.fround(3.2)` is `3.200000047683716`, so a duration float32 holds exactly
would land the last sample precisely on the last key rather than a hair before
it.

It is **wrong.** Rebuilt at `duration 2.1`
(`Math.fround(2.1) = 2.0999999046325684`, with every `t: 2` key moved to 2.1 and
nothing else touched) and rendered at `--fps 20 --max 1400`, it still reads
**0 / 255, 0 of 1741600 pixels differing**, `last frame at t = 2.100000s`. So the
difference between the two examples is something else, and #336 owns the
question. A plausible mechanism with a matching number is exactly the kind of
thing that gets written down as a finding.

⚠️ **What none of this can see is a velocity discontinuity.** A cycle whose value
matches at the seam but whose slope does not still reads as a hitch, and every
pixel in the measurement above is identical when that happens. The ripple's slope
is continuous by the `phase` construction — the crest passes the seam at the same
speed it passes every other key — but that is an argument, not a measurement, and
nothing here measured it.

## The rigging, and the two bones that exist only for a rule

```
root
└── bust
    ├── torso                        the plate the breath scales
    └── chest                        the breath's translate, a SIBLING of torso
        └── neck
            └── headtip              the nod's roll and its anticipation
                └── head             the head mesh's slot bone
                    ├── facebob      the shared shift, −R·sin t
                    │   ├── crown
                    │   ├── eye_l    eye_r
                    │   ├── snout
                    │   └── mouth
                    ├── earbase_l    the sway
                    │   └── ear_l    the ear mesh's slot bone
                    └── earbase_r
                        └── ear_r
```

**`facebob` has to be its own bone and not `head`.** `head` is the head mesh's
slot bone and the mesh's deform already carries that plate's motion; a translate
there would move the plate **twice**. FACE §3 states the rule and this is it on
the vertical axis.

**`earbase_l` and `ear_l` sit at the same point, and the extra bone is not
redundant.** `ear_l` is the ear mesh's slot bone, so under `--profile rig-play`
`A15_IDLE_NO_MESH_BONE_KEYS` refuses an `idle` that keys it — a mesh must never
idle-skip. The sway is keyed one link up, on `earbase_l`, which the assertion is
satisfied by and which is also where an ear actually hinges. **The rig that
satisfies the assertion is the better rig anyway**, which is FACE §3's line about
`headroll` and is why `headtip` exists too.

**The ears' 14° splay is in the bone and not in the mesh.** Rotating each root
bone outward means the wave's `axis: "x"` displaces the ear across *its own*
length rather than across the screen — which is what a floppy ear does. The mesh
stays axis-aligned inside its plate, because that is the only frame in which
"one row per 40 units down the ear" is a true sentence.

## Motion, per [MOTION.md](../../docs/MOTION.md)

**The key plan** (§3.2, pose to pose): `bow` is anticipation → extreme → hold →
release, at 0.18 / 0.6 / 1.25 / 1.8 s. The anticipation is §3.6's, and it lives
in two places at once — `headtip`'s roll and the projection's own `−4°` — which
is the thing §4.11.1 made affordable. `idle` is one arc out and back with the
extreme at 0.9 of 2.0 s, deliberately off centre so the return is slower than the
departure.

**The easing table** (§3.4) is three handles, the same three `portrait` uses:
`rise` `[0.4, 0, 0.86, 0.38]` into a move, `swell` `[0.42, 0, 0.58, 1]` across
one, `settle` `[0.12, 0.7, 0.3, 1]` out of one. The ripple keys carry none, on
purpose (above).

**The follow-through offsets** (§3.7), as fractions of `bow`'s 1.8 s:

| Part | Extreme lands | Fraction behind its driver |
| --- | --- | --- |
| the nod (`head` deform, `facebob`, `features`) | 0.60 s | — (the driver) |
| the ears' swing (`earbase_l/r`) | 0.78 s | **+10 %** |
| the ripple's amplitude peak (`ear_*` deform) | 0.72 s | +7 % |
| the ears' overshoot crossing | 1.48 s | last of all, one crossing |

§3.7 puts "something loose and light" at +20–35 % and overshooting. The ears take
**+10 %** instead, and that departure was tested rather than assumed. The +25 %
variant, keys pushed from 0.78 / 1.16 / 1.48 to 1.05 / 1.35 / 1.62 and nothing
else changed, renders green and reads wrong in a specific way: **frames 17–22 of
23 show the head back at rest with the ears still travelling outward**, so the
swing stops being the nod's follow-through and becomes a second action beginning
after it — which is §3.7's own warning about the far end of that range, arriving
ten points earlier than the table's 35 % because a fur-covered ear is not cloth.
They keep the overshoot, which is the half of §3.7 doing the work here.

## What is drawn, and how

Every PNG is generated from SVG written by hand in
[`make_parts.ts`](make_parts.ts) and the shared [`../rigby.ts`](../rigby.ts) — no
traced reference, nothing lifted from the benchmark corpus. `plate.png` is the
only opaque part, and `A19_OVERLAY_PNGS_HAVE_ALPHA` exempts exactly that one
role.

**Lepus is the gallery's third cast member, and `make_parts.ts`'s header carries
the defence.** In short: a nod needs features stacked up the face at different
depths, and Rigby's are drawn *into* one plate while Vela's are laid out for a
yaw — four of her six share a `y`. A ripple needs a long soft appendage a regular
strip fits, and neither of them has one. She is drawn in Rigby's palette and
outline weight, `../rigby.ts` still owns every colour and the rasteriser, and her
name continues Vela's: both are constellations, and Lepus is the hare.

`ART_SCALE` is **1** — nominal size, the size the outline weight was drawn for —
and the three mesh tables in `rig.json` are stated in the same unit.

🚨 **The one contract between the drawing and the rig is that a mesh draws
nothing outside its own triangles.** `make_parts.ts` states both ink boxes as
constants (`HEAD_INK`, `EAR_INK`) because they are `rig.json`'s grids converted
once, and every path is drawn a few pixels inside them. Cross one and the outline
is silently cut off — the way `squash`'s first ball lost its own line, with a
green gate and correct uvs.

## Why this example needed its own meshes — the two refusals

Both meshes already in the gallery were built for a different model, and each
one's inability to carry these two kinds is one command:

**`flex`'s leaf cannot carry a `wave`.** Its own README measures the ceiling: the
shipped ripple was fold-free only up to **0.5 px** and `A39` refused it at **1
px**, because ear clipping fans 77 boundary vertices from one apex at the tip, and
adjacent boundary vertices sit within **0.27 px** of the same ray from that apex.
What flips such a triangle is not how far the silhouette moves but how
*differently* two neighbours move — which is exactly what a wave does for a
living. This example's grid is that lesson inverted: two vertices per row, both
taking the same offset, and the fan gone.

**`portrait`'s head grid cannot carry a `pitch` at all.** Its rows are at
`y = ±180, ±90, 0` against `R = 170`, so the outer rows are **outside their own
cylinder** — and the compiler says so rather than clamping. The message names the
spec it read between `error:` and `animation`, and that half is cut here because
it is whatever path you chose:

**Reproduce it:** replace `"kind": "yaw", "radius"` with `"kind": "pitch", "radius"` in `gallery/portrait/motion.json`, then run `build`.
```
rigc compile error: animation "turn" deform default/head/head (t=0.62): transform pitch has
radius 170, and vertex 0 sits at y=180, which is 10 past it (about=0). The cylinder has no
surface there, so its depth would be 0 and the projection would be a different model at that
vertex. Raise the radius to where the part actually sits, or move the vertex. (see rigc guide CE_DEFORM_VERTEX_OUTSIDE_CYLINDER)
```

⇒ **A grid that is correct for a yaw is not a grid; it is a grid *for a yaw*.**
Its columns were solved against `R = 170` and its rows were never solved at all,
which is fine — a yaw does not read them — right up until something does. That is
the whole example in one refusal, and it is the reason the head plate here is a
transpose rather than a reuse.
