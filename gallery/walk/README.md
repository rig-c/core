# walk — IK constraints, and an IK timeline that lets a leg go

Rigby walks on the spot. Two legs, each a two-bone chain with an **IK constraint**
solving it to a foot target, and an **IK timeline** that holds the planted leg to
the ground and releases the swinging one at the top of its lift.

⭐ **The one feature this example stars: `ik`.** The constraint
([AUTHORING §3.5](../../docs/AUTHORING.md)) and the timeline that keys it
([§4.9](../../docs/AUTHORING.md)). Everything else here — the hip bob, the
follow-through on the ears and the scarf, the arm swing — is the ordinary
key-pose-and-in-between recipe of [MOTION.md](../../docs/MOTION.md), and it is
present because a leg chain on its own is not a walk.

```
bun install                                   # once

bun cli.ts build   --rig gallery/walk/rig.json \
                   --motion gallery/walk/motion.json \
                   --out gallery/walk/build
bun cli.ts render  --candidate gallery/walk/build --fps 20 --max 288 \
                   --out gallery/walk/render
bun cli.ts preview --candidate gallery/walk/build --out gallery/walk/preview.html

# does the cycle close on the pose it opened with? `--duration` is the animation's own
# length out of motion.json; the tool refuses the reading when the set's last frame is
# not at it, which is every rate `0.9 x fps` is not a whole number at (issue #337).
bun gallery/loop_seam.ts gallery/walk/render/walk@20fps --duration 0.9

# re-draw the 15 part PNGs. Needs rsvg-convert; the PNGs are committed, so this
# is for changing the art or checking that the committed bytes are the ones the
# script draws.
bun gallery/walk/make_parts.ts
```

`build`, `render` and `preview` write into this directory and are **not
committed** — the specs and the part PNGs are, and those three commands
regenerate the rest. Look at `gallery/walk/render/walk@20fps/contact.png`: it is
the whole cycle on one sheet, which is the only place a loop is a thing you can
see.

---

## The rig

15 region attachments, 21 bones, 2 IK constraints. Three parts of it are
decisions rather than transcription:

### The leg is two plates, and the seam is the knee

A one-piece leg cannot bend. `thigh` and `shin` are separate parts, each drawn
**from its own joint**, and each bone's local **+x runs down the limb** —
`thigh_*` at `rotation: -90`, `shin_*` at the thigh's own `x: 56` with no
rotation of its own. That axis is not a style: `IkConstraint.apply2` measures the
chain as `l1 = child.x` and `l2 = child.length`, and solves so that the point
`l2` along the child's **+x** reaches the target. A chain whose bones point some
other way solves correctly and draws nowhere near the target.

The plates then need `"rotation": 90` to cancel the bone, because they are drawn
upright, and an `x` offset to slide their centre down the bone — 28 for the
thigh, 31 for the shin, which is each plate's own centre measured from its joint.

```
    hip ─┬─ thigh_f  (rotation -90, length 56)  ─── shin_f  (x 56, length 74)
         └─ thigh_b  (rotation -90, length 56)  ─── shin_b  (x 56, length 74)

    root ── ground ─┬─ foot_f   ← the IK targets
                    └─ foot_b
```

### The foot targets hang off `ground`, not off `hip`

This is the whole reason the example has an IK chain in it. In a walk the hip
**bobs** and the planted foot **does not**, so the target has to be somewhere the
hip's own motion cannot reach it. `ground` is a child of `root` at the contact
line; `foot_f` and `foot_b` are children of `ground`. Parent a foot target to
`hip` and the hip carries its own feet up with it, the solver reports success, and
the figure hovers.

Measured on this build, over the stance where `foot_f` is planted:

| t | `hip` world | `foot_f` world |
| --- | --- | --- |
| 0.000 | 352.0, 190.0 | 382.0, 68.0 |
| 0.150 | 354.7, 197.1 | 382.0, 68.0 |
| 0.200 | 354.9, 197.9 | 382.0, 68.0 |
| 0.300 | 353.7, 194.5 | 382.0, 68.0 |
| 0.450 | 352.0, 190.0 | 382.0, 68.0 |

The hip travels 7.9 units up and 2.9 sideways; the foot does not move at all, to
the decimal. That is the IK earning its place, and it is the number to reproduce
if you change the leg.

### `bendPositive` is **opposite** on the two legs

The two chains are *translated* copies, not mirrored ones — both thighs point
down, both plates are the same drawing. So one `bendPositive` value bends both
knees the same way round, which reads as one leg being on backwards. Opposite
values give a symmetric pair:

| | `bendPositive` | thigh at x | knee (`shin`) at x | knee sits |
| --- | --- | --- | --- | --- |
| `leg_f_ik` | `false` | 382 | 397.8 | 15.8 outward |
| `leg_b_ik` | `true` | 322 | 306.2 | 15.8 outward |

Both bulge away from the body. `true`/`false` swapped gives a knock-kneed pair at
the same 15.8; the arithmetic is `56 · sin(16.4°)`, where 16.4° is the hip angle
the law of cosines gives for `l1 = 56`, `l2 = 74` and a target 126 away.

🚨 **And the value has to be stated on every key of the IK timeline as well as on
the constraint** — see *What this cost*, below. That is not an idiom, it is a
runtime hole ([issue #273](https://github.com/rig-c/core/issues/273)).

---

## The motion

`walk`, 0.9 s, two steps, loops. The plan, and why each piece is the size it is:

| Track | Keys | What it is for |
| --- | --- | --- |
| `foot_f` / `foot_b` `translate` | 6 | the step. Two equal keys for the stance **hold**, then three through the flight |
| `hip` `translate` | 5 | the bob: twice per cycle, peaking over the planted foot, with 3 units of weight shift toward it |
| `chest` `rotate` | 4 | the body's sway, one cycle, **+10%** after the hip |
| `head` `rotate` | 4 | the head holding level against the chest, **+20%** |
| `ears` `rotate` (a group) | 5 | the bounce, twice per cycle, **+25%**, biggest amplitude of anything here |
| `tail` `rotate` | 4 | the scarf, one cycle, **+30%** |
| `arm_f` / `arm_b` `rotate` | 4 | the arm swing, in antiphase with each other |
| `hand_f` `rotate` | 3 | the wrist, **+15%** after its arm |
| `ik` × 2 | 5 each | ⭐ the star — below |

Those percentages are [MOTION.md §3.7](../../docs/MOTION.md)'s offset table, as
fractions of the duration, and they are the cheapest thing on this page: same
poses, same easings, same key count, and the figure stops reading as one rigid
piece.

Four named easings, per [§3.4](../../docs/MOTION.md) — one that leaves an extreme
slowly (`gather`), one that leaves fast and arrives slowly (`charge`), and two
symmetric (`settle`, `breathe`). Nothing here is linear; a missing `ease` would be
a positive claim of constant speed.

### The flight arc needs interior keys, and the stance needs two

Both are [§3.5](../../docs/MOTION.md) and [§3.3](../../docs/MOTION.md) doing
geometric work rather than shaping timing:

- A `translate` track draws the **straight line** between two keys. The foot's
  path through the air is an arc, so the three interior keys at 25 / 50 / 75 % of
  the flight are what the arc is made of — remove them and the foot travels in a
  V.
- The stance is a **hold**, and a hold is authored: `foot_f` carries the same
  `[0, 0]` at `t: 0` and at `t: 0.45`. One key would slope a line through the
  whole stance and the planted foot would drift.

### ⭐ The IK timeline

```json
"ik": [
  { "constraint": "leg_f_ik", "keys": [
      { "t": 0,     "mix": 1,    "softness": 0,  "bendPositive": false, "ease": "settle" },
      { "t": 0.225, "mix": 1,    "softness": 12, "bendPositive": false, "ease": "settle" },
      { "t": 0.45,  "mix": 1,    "softness": 0,  "bendPositive": false, "ease": "gather" },
      { "t": 0.675, "mix": 0.55, "softness": 0,  "bendPositive": false, "ease": "charge" },
      { "t": 0.9,   "mix": 1,    "softness": 0,  "bendPositive": false } ] },
  …
]
```

Three things are being said, and `leg_b_ik` says the same three half a cycle later:

- **`mix: 1` through the stance** (0 → 0.45): the foot is nailed to the contact
  line and the hip moves against it. This is the table above.
- **`softness: 12` at mid-stance** (0.225): mid-stance is where the leg is
  nearest full extension, and a two-bone chain at full reach locks and pops.
  Softness backs the target off as the chain straightens, so the knee runs out of
  bend smoothly instead of snapping.
- **`mix: 0.55` at the top of the lift** (0.675): the leg is *let go*. With the
  mix down, the pose blends back toward the bones' own setup — a straight leg —
  so the swing reads as a loose pendulum rather than a foot being dragged along a
  path. `mix` returns to 1 at 0.9, which is the plant.

Every field is stated on **every** key. That is [§4.9](../../docs/AUTHORING.md)'s
rule and it is not a formality: the parser reads each field fresh per key with its
own default, so a key that omits `softness` does not hold the previous key's 12 —
it asserts 0 and interpolates down to it.

---

## What was verified

| | |
| --- | --- |
| `rigc build --profile spine` | green — the run's own verdict is quoted below the table, and `A34_CONSTRAINT_TIMELINE_TARGETS` is among the rules it measured |
| `rigc build --profile rig-play` | green as well — same. Nothing here needs the default profile to pass |
| `rigc render` | 19 frames at 20 fps, contact sheet **looked at** twice — the first pass caught a 56-unit foot lift that splayed the knees, and a far arm swung out far enough to read as a plank |
| loop seam | **at `--max 288`**, which is 230×288 here: **0 / 255** max channel difference, 0 pixels differing of 66 240, at both 20 fps (19 frames) and 30 fps (28 frames) — both rates land on the 0.9 s duration (18 and 27 samples), so both are seam readings and not comparisons against some other time ([#337](https://github.com/rig-c/core/issues/337)). The last frame is the first frame to the byte. 📏 The `--max` is part of the figure: a seam reading is scale-relative and a zero at one size is not a zero at every size ([#336](https://github.com/rig-c/core/issues/336)) |
| the bone series | `t = 0.900` is identical to `t = 0.000` on every bone, so the seam is closed in the pose and not only in the pixels |
| `rigc preview` | boots in the official Spine Web Player 4.3 and draws (headless chromium, no console or page errors) |
| `bun run selftest` | includes `GALLERY_EXAMPLE_IS_GREEN[walk]` |
| part determinism | `make_parts.ts` twice ⇒ identical bytes for all 15 PNGs |
| `bun run typecheck` / `lint` | green |

**The two verdicts, verbatim** — the report's last rule line and the summary under
it. Quoted rather than paraphrased, so the selftest's transcript gate re-runs both
commands and compares them line for line: the figures here are read off the run
instead of being kept by hand
([#609](https://github.com/rig-c/core/issues/609)).

`rigc build`:

```
PROF  A30_STROKE_WITHIN_CAP_CONTAINMENT: archetype rule, not in profile "spine"
..    51 assertions: 15 measured (15 passed, 0 failed), 21 skipped, 15 not in profile "spine"
```

`rigc build --profile rig-play`:

```
SKIP  A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS: the rig "walk" declares no axes (invariants.axes)
..    51 assertions: 19 measured (19 passed, 0 failed), 32 skipped, 0 not in profile "rig-play"
```

---

## What this cost — the authoring notes

**An `ik` timeline silently reverted the rig's `bendPositive`, and it took a
measurement to see it.**
[Issue #273](https://github.com/rig-c/core/issues/273), **fixed**. Four builds
differing only in the rig's two `bendPositive` values produced **one pose** —
`shin_f` world x = 366.2 in all four. `SkeletonJson` reads the bend direction per
*timeline key* as well as per constraint, with the same default of `true`, so any
IK timeline that did not restate it overwrote the constraint's value for the whole
animation, with the field still in the file and the gate green either way. rigc
now stamps the rig's value onto every emitted ik key, so the same four builds pose
four poses (`shin_f` 366.2 / 397.8 / 397.8 / 366.2). The explicit
`bendPositive` on every key of `motion.json` above is kept: it was the workaround,
it is still exactly what the fix would have written, and it is what the editor's
own export does — so this example goes on showing what a complete ik key looks
like. Stating a flag on every key still overrides the rig, which is the point of
keying it at all.

**A cyclic track cannot be lagged with `stagger` or `lag`.** [MOTION.md
§3.7](../../docs/MOTION.md)'s follow-through is a timing offset, and the motion
spec has two fields for exactly that — except both shift keys *later*, which
pushes a loop's last key past `duration` and is a compile error. So an offset
cyclic track is authored as a **phase-shifted wave**: its extremes move, its `t:
0` and `t: duration` keys carry the same (nonzero) interpolated value, and the
final segment is short. `chest`, `head` and `tail` all look like that, and the
short last segment is the offset, not a mistake.

**The knee direction is invisible on a contact sheet and obvious in a number.**
Two of the four `bendPositive` combinations were indistinguishable at 4× zoom on
the frame where the difference is largest. `shin_f.worldX` separated them
immediately. Look at frames for *whether it reads*; read bone positions for
*what it is doing*.

**A foot lift is bounded by the leg, not by taste.** The first candidate lifted
the foot 56 units on a 130-unit leg: the chain has to fold to a 70-unit span, and
a two-bone solve does that by throwing the knee sideways. 28 units — a fifth of
the leg — is the version that reads as a step.
