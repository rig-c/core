# Rung 8 — attempt 1 — the loop

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session
- brief:     [`bench/briefs/8-follow-through.md`](../../briefs/8-follow-through.md)
             **revision 2** (verified by a third party, 2026-08-23)
- inputs:    the brief, [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full,
             [`bench/runs/README.md`](../README.md),
             [`docs/LADDER.md`](../../../docs/LADDER.md) — *"How a rung is scored"* and
             *"The honesty rule"* only, as the run's instructions directed,
             `examples/8-follow-through/images/`,
             `bench/reference/8-follow-through/`, and this repository's own source
             (`src/render.ts`, `src/rig.ts`, `src/types.ts`, `src/check.ts`,
             `src/diff.ts`, `src/ladder.ts`, `tools/plate.ts`)
- reference: **not read.** `examples/8-follow-through/export/`,
             `bench/transcriptions/`, `bench/render_reference.ts`,
             `bench/count_features.ts`, `docs/SPEC_COVERAGE.md`, other runs' rig and
             motion specs, and git history were never opened. See *Honesty* below
             for the one file that needs a note.
- guide:     AUTHORING.md §10 in hand (this run is after the 2026-08-23 boundary)
- profile:   spine
- `bench`:   run **once per candidate**, at the end, after the last edit to either
             spec. Neither spec was touched afterwards.

Historical worktree: `../rigc-wt-rung8` relative to the repository root,
on `bench/rung8-run1`, per
[`bench/runs/README.md`](../README.md).

## Honesty — one file worth declaring

[`src/ladder.ts`](../../../src/ladder.ts) was opened to find out how `bench` resolves
a **two-skeleton** rung, which is the one piece of tooling behaviour this rung needs
and the protocol warns about. It is repository source, not a reference export, and it
carries no bone name, key time, curve or count. It does carry one sentence about this
rung — *"nothing new — transform constraints and weighted meshes both arrived at rung
6"* — which is the same sentence the ladder's own table carries and which this run's
own instructions had already quoted. It changed no decision here: constraints were
left unauthored for the reason in §12, and that reason is about what frames can show.

Nothing else was read that the protocol lists. `check` was run throughout the loop,
which the protocol explicitly allows — it never opens the reference skeleton.

## An interruption, recorded because the protocol asks for every turn

The authoring session was cut mid-response by an API connection loss ("Connection
lost mid-response") after §10, and resumed from the run directory. **Nothing about
the run's inputs changed**: no file was read that had not already been read, the
reference export was still never opened, and `bench` had not yet been run at that
point — it is run once per candidate at the very end, below. The run is still
**clean**. It is recorded here because a log that omits its own interruptions is
not the record this protocol asks for.

## Method, in one paragraph

Both shots were fitted the way rung 6's log describes and for the same reason: an
estimator run on the reference frames alone cannot carry a ten-parameter pose on a
subject 20 px across, but **rendering the candidate back into the frames' own
viewport and minimising the difference can** — and any bias in the rasteriser
cancels, because both sides go through the same one. Where a shot has geometry an
estimator *can* carry, that came first and the pixels only polished it: the
`pendulum`'s six orange components give its whole pose analytically, and the render
fit then took the last fifth of a pixel off. Every script is in [`tools/`](tools/)
and every number below came out of one of them.

## 1 — the art, measured before anything was authored

`tools/art.ts` reads the eight PNGs' alpha and colour rather than looking at them.
What came out and changed the build:

| File | drawn box | orange component(s) | what that fixed |
| --- | --- | --- | --- |
| `ball.png` 156×156 | 154×154 at (1,1) | one, centred | the ball is a true disc; its own anchor is the plate's centre |
| `tail.png` 380×111 | 378×109 | three: 13,213 px at x 182–374, then two at x 88–135 | the orange half is the **right**, so the blunt right end (12 px tall at x 378) is the one that joins the ball and the silver point at x 1 is the tip. Column heights rise 3 → 109 by x 155 and taper to 12 — a flame, not a wedge |
| `platform.png` 687×106 | 685×105, **flush with row 0** | one rim, x 3–682 at y 53–88 | the rim's farthest pair is 679 art px → 111.9 px at this shot's scale, and its midpoint (342.5, 54.5) is the anchor the whole shot is measured from |
| `chain-1.png` 108×303 | 106×302, **flush with row 0** | one bead, 8,243 px at (53.5, 49.0) | the bead is the link's own anchor |
| `chain-2/3/4.png` | 72×250 / 72×221 / 72×194 | one bead each, 4,148–4,150 px at (36.5, 36.5) | the three lower links share an anchor to a tenth of a pixel |
| `chain-end.png` 126×120 | 124×118 | one disc, 4,491 px at (63.8, 66.5) | the disc sits 6.5 art px below the plate's centre |

The brief's correction 6 reproduces: `platform.png` and `chain-1.png` have alpha in
row 0 and the other six do not.

## 2 — the `pendulum` solves analytically, and that is worth doing first

`tools/measure-pendulum.ts` finds **exactly six orange components on every frame of
both rates** — the rim and five beads — which is the brief's own estimator written
from scratch. Scored against the brief before it was used for anything:

| quantity | brief (rev 2) | this pass |
| --- | --- | --- |
| rim, tip to tip | 109.6–111.2 px, mean 110.5 | 109.6–111.2, mean 110.4 |
| joint spacings | 40.7 / 39.2 / 34.6 / 34.6 px | 40.71 / 39.18 / 34.58 / 34.59 |
| subject area | 2,919–2,971 px | 2,919–2,971 |
| tilt | −16.3 → +32.8, five level crossings | −16.3 → +32.8 |
| total bend | 0.6° at f0, 103.0° at f26 | 0.5° at f0, 103.0° at f26 |
| eyelet extremes | x = 478.6 at f12, x = 33.9 at f24, y = 118.3 at f25 | 479 / 34 / 118 |
| lag, per axis | x: 4 at 12 fps (r 0.79); y: 0 (r 0.72) | x: 4 (r 0.793); y: 0 (r 0.717) |

## 3 — one loop lost to `bone.pose`

The first render fit produced **an identical frame for every pose** and an MAE of
17.3 that did not move for any parameter. spine-core 4.3 keeps a bone's local
transform on `bone.pose`, not on the bone: writing `bone.rotation = …` is neither
an error nor a rotation — it adds a property nothing reads, and every frame renders
as the setup pose. Fixed in `tools/harness.ts`; MAE 17.3 → 2.76 on the same poses.

*Guide note: nothing in §9 or §10 covers driving the runtime directly, which is
fair — but the run's own render loop is the method §8's "look for a second way to
get the number" points at, and this is the trap at its door.*

## 4 — where the chain hangs from, fitted rather than assumed

The topmost bead is the one thing in this shot that cannot be measured directly:
the discus covers about 70 % of it, so its centroid is a crescent's. So the top
joint was fitted instead — the point, fixed in the discus's own frame, that keeps
its distance to the **second** bead constant across every frame:

```
12 fps: pivot (−0.10, −0.06) px from the rim's tip midpoint, link 1 = 50.28 px (sd 0.213)
24 fps: pivot (+0.01, +0.02) px,                              link 1 = 50.23 px (sd 0.238)
```

⇒ **the chain hangs from the discus's own centre**, which is also the point the
discus turns about, and link 1 is **305 units** — not the 247 the occluded bead
reads. Two frame sets, two independent circle fits, the same answer to a hundredth
of a pixel. A whole-chain least squares over beads 2–5 then gives
`L = 305.4 / 238.5 / 209.1 / 210.0` units with each link's own bead **on** its bone
(h₂,h₃,h₄ within 0.9 units of zero) and an rms bead residual of **0.21 px**.

⚠️ That least squares carried a real bug for part of the run: its Gauss-Jordan back
substitution indexed `row[i][i]` — a number, then an index into it — so every solve
returned `NaN`, every Levenberg step was rejected, and the "fit" was its seed with a
coordinate descent on top. The seed happens to be the exact solution when h = 0, and
the independent circle fit above agrees, so the numbers stand; the bug is recorded
because nothing except reading the code found it, and a silently-degenerate solver
that returns a plausible answer is the shape of defect §8 is about.

## 5 — `chain-1`'s anchor: the one number the beads cannot give

Where chain-1's own bead sits below the hang point is not measurable off the
reference, because the crescent that shows is not the bead. So it was **swept
against the pixels** — build the rig at each candidate, render all 88 frames, read
the mean difference:

| h₁ (units) | 0 | 6 | 12 | 18 | 24 | **30** | 36 | 49 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| window MAE | 2.762 | 2.721 | 2.662 | 2.594 | 2.534 | **2.497** | 2.519 | 2.642 |

A shallow minimum at **30 units (4.9 px)**, re-run at 26/28/30/32/34 as
2.519/2.505/**2.497**/2.498/2.506. See §9 for the second, independent reading of
the same parameter — and for where the two disagree.

## 6 — the eyelet's rotation is not in the frames, and the fit says so out loud

The per-frame pixel fit was first run with **eight** parameters — the discus's x, y
and rotation, the four links, and the eyelet. Every other column came out smooth
frame to frame. The eyelet's did this:

```
f0 24.5°  f1 16.2°  f2 23.1°  f3 −3.5°  f4 28.9°  f5 21.3° … f31 −25.0° … f13 +51.8°
```

— a −25°..+52° range with no trend, on a frame set where the discus and every link
move by less than a degree between neighbours. That is what an unobservable
parameter looks like when an optimiser is allowed to spend it: a round disc set in
a round ring cannot show its own rotation. **It was frozen and left unauthored**,
and the cost of that honesty is measured: mean MAE 1.069 with the eyelet free
against **1.279** with it frozen. The shipped rig has no `eyelet` rotate timeline.

## 7 — the pose fit, and what it buys over the estimator

`tools/fit-pendulum-pixels.ts polish` starts from the analytic solution and does a
local search on the seven remaining numbers per frame, against the reference frame
through the same rasteriser.

| | window MAE |
| --- | ---: |
| the analytic solution, straight off the beads | 2.497 |
| after the pixel polish | **1.279** |

Half of that gain is the discus's rim estimator: its own control puts it at ±0.5°
and half a pixel, and half a pixel of the discus is worth more than that on a
110 px rim.

## 8 — keys, curves, and a substitution that cost four times the floor

Key placement follows §10.3 🧩 — turning points, hold boundaries, and wherever one
Bezier span cannot hold the shape — with the shapes coming from §10.4 🧩: a small
named table, reused by name, no raw `curve` anywhere.

🚨 **The first version fitted each span's own handles and then wrote the nearest
table entry.** The gate was green, `diff` would not have moved, and the rendered
result went from **1.07 to 4.65 MAE** — four times the fit's own floor — because a
key count bought at one tolerance was shipped at another. The planner now runs in
two passes: pass A fits freely and only exists to *discover* which shapes the shot
uses, they are clustered, and pass B re-plans every timeline **under the table it
will actually write**. Same idea as rung 6's §13 clamp: a constraint that is not
enforced where the value is written is not a constraint.

⚠️ A second trap in the same place: **a rotation's tolerance is not a number of
degrees.** A quarter of a degree on `chain4` moves the eyelet 0.15 px and the same
quarter degree on the discus moves it 0.69 px, because everything below comes with.
One tolerance is declared, in pixels at the end of the chain, and divided by each
bone's lever arm.

With that fixed, the trade-off is small and worth showing (24 fps set):

| tolerance at the eyelet | keys | window MAE |
| --- | ---: | ---: |
| 0.6 px | 259 | 1.619 |
| **0.3 px** | **300** | **1.402** |
| 0.15 px | 377 | 1.305 |

and the size of the easing table trades against the key count at a fixed tolerance
— 4 easings/368 keys, 8/314, **12/300**, 16/284 — because a richer table holds more
spans. Shipped: **0.3 px, 12 easings**. A synthetic control says what the curves are
worth: two harmonics over 88 samples reduce to **9 keys** at 0.88 units of error
with fitted Beziers, where the same 9 keys read **24.3** with linear spans.

## 9 — draw order: the frames decide more of it than the brief could

The brief settles one edge — the discus is in front of the top link, because that
bead reads 57–66 px where an unoccluded one is 222. It then says the rest "the
frames still do not show". **They do, like-for-like**: render a candidate back and
measure the same feature on both sides. Composited unoccluded at this shot's scale
each lower bead is 113 px, and the terminal disc 122:

| | bead 1 | bead 2 | bead 3 | bead 4 | bead 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| reference | 58–71 | **99–106** | **99–107** | **101–109** | 119–126 |
| candidate, links stacked child-in-front | 51–63 | 108–116 | 109–116 | 109–116 | 119–126 |
| candidate, links stacked **parent-in-front** | 51–63 | **99–107** | **96–104** | **95–104** | 119–126 |

⇒ each link is drawn **in front of the one below it**, and the reversed slot order
is what the reference does. Bead 5 reads identically on both sides and under either
stacking, because the link above it stops 3.7 px short of its disc — so the
eyelet's own place in the order is genuinely undecided, and it is put behind on the
same pattern rather than on evidence. The change is worth 1.402 → 1.335 MAE and it
moves `slots.order` in `bench`, which is the point: this is a convention the gate
cannot see and the measures can.

⚠️ **The two readings of h₁ disagree, and the disagreement is the finding.** Swept
by MAE, h₁ = 30 units; swept by bead-1 visibility against the reference's 58–71, it
wants about 33 (h₁ = 30 reads 51–63, h₁ = 36 reads 67–80) and the MAE rises
monotonically past 30 (1.335 → 1.376 → 1.480 → 1.586 at 30/36/42/48). One anchor
number cannot satisfy both the crescent above the link and the joint below it, so
the reference's top link is placed with one degree of freedom more than this rig
gives it. **h₁ = 30 shipped**, on the more comprehensive measure, and the shortfall
is in *Known-wrong*.

## 10 — the `ball`: three defects the gate could not see, all found by reading the fit back

The comet's ten parameters per frame have to come out of an optimiser. The first
run of it produced a green build and a plausible MAE, and three things wrong:

1. **`tail0` wrapped.** Its fitted series ran `0.9, −323.4, −363.9, 24.7, −332.3`
   — the same poses 360° apart. Between two keys that is a spin. Unwrapped against
   the previous frame.
2. **`sy` went negative** — `−0.247` at f40, a mirrored ball. This is rung 6's §13
   exactly: the bound was on the *step*, not on the value. The clamps are now where
   the parameter is written.
3. **The ball's scale was paying for the trail's error.** f0 — which the estimator
   reads as round at 1.09 and the brief calls a wind-up — came back fitted at
   **1.56 × 0.59**. A chain started straight cannot find six rotations at once, so
   the optimiser spent the one parameter that could cover the difference. Fixed by
   seeding the chain from the trail's **measured centre line** (a cubic in geodesic
   distance, the same estimator the bow figures come from).

| | window MAE |
| --- | ---: |
| straight-chain seed, no unwrap, step-bounds, no continuity pass | 3.670 |
| centre-line seed + unwrap + value-bounds, after continuity pass 1 | 2.882 |
| … after continuity pass 2 | 2.831 |
| … after the multi-start rescue | see §12 |

(The three fixes and the continuity passes landed in one edit, so the middle row is
their joint effect and not any one of them.)

**Segments: the frames do not choose.** 6 and 8 over the same shot come out 3.670
and 3.685 — 0.4 % apart, which is rung 6's finding reproduced. Six shipped, chosen
on what a comet-trail rig has to do rather than on pixels that are silent.
**`lead`** — how far the spindle's blunt end sits from the ball's centre — was swept
at −60/−40/−20/0/+40 units for 6.89/6.23/**5.60**/6.12/7.49, and the art scale at
1.0/1.05/1.10 for 6.12/6.09/6.79 against a 1.0 that the art itself gives (a 154-unit
ball measures 22 px at this scale, and 154 × 0.142758 = 21.98). Shipped: lead −20,
art scale 1.

## 11 — draw order in the `ball`: tested the same way, and genuinely undecided

The brief calls this one undecidable because the two parts meet inside the ball's
own silhouette. That is true of most of the shot but **not** of the landing frames,
where the trail curls right over where the ball is — so the same like-for-like test
was run: both orders built from the same fitted poses, both rendered back.

| | whole shot | the curled frames f25–f28, f39–f41 |
| --- | ---: | ---: |
| ball in front of the trail | **2.746** | 3.147 |
| trail in front of the ball | 2.767 | **3.073** |

0.8 % apart over the shot and 2.4 % apart on the curled frames, **and they point
opposite ways** — on an objective whose own scatter is larger than either gap, and
with the poses fitted under the first order, which gives it the advantage. So the
brief is right about this one: nothing here decides it. **Ball in front** shipped,
on rung 6's reasoning rather than on a measurement — the spindle's blunt end is a
flat cut, art built to be tucked under a head, and drawn over the ball it would read
as a straight seam across it.

## 12 — the `ball`'s rescue pass, and where it stopped

After the continuity passes, every frame still costing more than twice the median
got a 24-start shake of its bend and its squash. It moved the shot from **2.831 to
2.746**, and most of that came from two frames (f40 4.97 → 3.73, f2 5.12 → 4.81);
f60 and f61 barely moved (10.50 → 10.06, 11.18 → 10.98). Those two are the descent
out of the last arc, where a six-link chain can be folded two ways for nearly the
same silhouette, and the optimiser is not what is wrong there.

The tolerance table, with the fit's own floor at 2.746:

| tolerance at the trail's tip | keys | window MAE |
| --- | ---: | ---: |
| 0.6 px | 435 | 3.441 |
| 0.4 px | 489 | 3.237 |
| **0.3 px** | **501** | **3.171** |
| 0.2 px | 538 | 3.120 |
| 0.05 px | 635 | 3.079 |

⚠️ **Read the bottom row.** At 0.05 px the interpolation is doing essentially
nothing and the shot is still 0.33 MAE off the fit it came from, where the same
sweep on the `pendulum` converges onto its floor. That gap is **not** key
reduction; it is the mesh being posed through eight timelines whose keys are chosen
per timeline while the error they make is joint. Shipped at 0.3 px on the same rule
as the `pendulum`, and the density it produces — 63 keys per timeline over 88
frames — is this run's own key-density risk, in exactly the shape rung 4 recorded.

## 13 — constraints: not authored, and why

Nothing in either rig is a constraint. This is a decision and not an oversight:
**a constraint is invisible in rendered frames** — a bone driven by a transform
constraint and the same bone keyed directly produce identical pixels, which §9.3
states outright — so authoring one would be a guess dressed as a reading, and the
run has nothing to point at if asked why there are four rather than one. Rung 6
made the same call and scored `constraints 0.000` for it; that measure is the price
of the rule, and it is worth paying rather than winning by guessing.

Two things are worth saying beside it. First, if this shot's machinery *were* to be
guessed at, the `pendulum` is where it would go: a chain that lags its driver
horizontally and not vertically is what a physics constraint does, and Spine has had
them since 4.2. Second, guessing one here would have been actively harmful to
everything else in the run — a physics constraint is simulated at load, so it would
have moved the hand-fitted poses `check` was measuring, and the run would have lost
its only view of whether the animation is right.

## 14 — the finish line

`bench 8` was run **once per candidate**, after the last edit to either spec, and
neither was touched afterwards. The matching line of each run is in
[`README.md`](README.md), verbatim; the other line in each run is this candidate
diffed against the other skeleton's reference and measures nothing.

```
bun cli.ts bench 8 --candidate bench/runs/2026-08-23-rung8-1/pendulum/spine \
  --frames bench/reference/8-follow-through/pendulum --json …/pendulum/bench.json
bun cli.ts bench 8 --candidate bench/runs/2026-08-23-rung8-1/ball/spine \
  --frames bench/reference/8-follow-through/ball --json …/ball/bench.json
```

Both `validate` green under `--profile spine`. The run is **clean**, not
bench-assisted.

### What the finish line said that the loop could not

Three things only `bench` could see, all of them recorded here rather than acted on:

- **The two references disagree about constraints.** `pendulum` has none, `ball` has
  four. §13's decision not to guess scored **1.000** on one and **0.000** on the
  other, from the same reasoning — which is the cleanest demonstration this ladder
  has produced that the rule costs something real and is still the right rule.
- **`slots.order 2/2` on the `ball`.** §11 measured both orders, found them 0.8 %
  apart and pointing opposite ways, and shipped the one rung 6 reasoned its way to.
  It was right. The measurement that could not decide it was correct to say so.
- **`key_counts 135/302` and `307/501`.** The tolerance that produced them is a knob
  whose whole curve is in §8 and §12; the reference sits near the loose end of it.
  Nothing was re-cut, because `bench` is the finish line.

## Notes for the guide

Collected in [`README.md`](README.md) — six of them, the first two of which cost this
run a loop each.
