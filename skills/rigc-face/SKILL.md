---
name: rigc-face
description: Author a face on plain Spine data with rigc — a blink, a gaze shift, a breathing portrait, a head turn (from a flat sheet a few degrees off axis or a per-vertex depth map across its turn ceiling) and slider-driven face dials, built from closed-form deform transforms, derived group tracks, per-part parallax and socket alpha clipping. Use when the request is a talking or living portrait, a standing character, an expression, a head turn or a look dial, such as "rig this face", "make the portrait blink and look around" or "turn the head". Not for Live2D file conversion, cutting a face illustration into parts, or VTuber-style real-time face tracking.
license: MIT
compatibility: Requires Bun 1.4 or later and the npm package @rig-c/core (rig-c is the convenience name).
---

# Face — a turn, a gaze, a blink and a dial

Load this when the request is a **head rather than a body**: a drawn face that
breathes, blinks, moves its eyes, turns off axis (on a flat sheet or a per-vertex
`depth` map) or exposes its turn as a slider-driven dial. Every rule below is owned
by [FACE.md](https://github.com/rig-c/core/blob/main/docs/FACE.md); this file says when to open it and what it will
not do for you.

📖 **A failure line ends with the command that prints its row of the guide** —
` (see rigc guide <RULE>)`. Run that command first, before reading anything else:
it prints that rule's row of the shipped guide and nothing else. `rigc guide §<n>`
(and `§<n>.<m>`, `§<n>.<m>.<k>`) prints the section's heading, own prose and
subsection index from `docs/AUTHORING.md`; add `--all` to include subsection
bodies. A leaf prints its full text either way. Sizes describe full ledger spans;
`--all` with a rule name is refused, exit 2. A compile error points at its stable
`CE_` code row. `rigc guide §5.1.<k>` prints a numbered compile-error group of
at most 30,000 UTF-8 bytes, and `rigc guide §5.1` prints the introduction and
index within that same limit; only legacy uncoded library errors point at `§5.1`.

## Non-negotiables

- **Validation is never bypassed.** `build` writes nothing on a red gate, and there
  is no flag that changes that — AUTHORING §0.
- **The compiler never invents a value.** A `deform` key states either explicit
  vertex deltas or `transform` (`yaw`/`pitch` with `radius` and `degrees`, or over
  the mesh's per-vertex `depth` sheet, AUTHORING §3.4.5 and FACE §2.1, §2.2), and a
  bone group track states `derive` (`depth` per member, `carried` shared shift); the
  compiler evaluates the closed form from the parameters you declare and never
  guesses a radius, angle or depth — AUTHORING §4, §4.5.1, §4.11.1 and FACE §1,
  §1.1, §3.1.
- **A face angle exposed as a dial is a slider constraint, not a playback time.**
  Map a control bone across `[−1, +1]` onto the turn animation with a slider
  (AUTHORING §3.5.2, FACE §8), bound its degrees by the turn ceiling `build` and
  `explain` print for the depth sheet (FACE §2.2), set `additive: true` when yaw and
  pitch dials share a target (`A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET`), keep driven
  constraints after their driver (`A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER`),
  read the dial across its value grid with `rigc render --candidate <out> --parallax <dial>`
  (AUTHORING §8.12), and clip an iris or highlight to its painted socket with
  `alphaClip` (AUTHORING §3.4, FACE §11).
- **The validator's messages are the instructions.** Read each named failure as the
  pointer to the file that has to change — AUTHORING §5.

## What this guide will not do

A `deform` key's own geometry is measured now.
`A39_DEFORM_KEEPS_TRIANGLE_WINDING` refuses a key that folds a mesh inside out —
per key, per interpolated span between two keys, per frame and per skin — and
names the reversed triangles with their signed areas. `invariants.deformMayFold`
in the rig spec is the one declared exemption, so reach for it when the slot
folds on purpose and never to quiet a refusal you have not read. It is an
**archetype** rule: a `--profile spine` build prints `PROF` for it and says
nothing about the fold, so author under `--profile rig-play`.

What `A39` still cannot say is whether the projection was the right one —
nothing measures whether 12° was the angle the shot wanted. FACE §9.2 is that
demonstration, three builds with one of them refused, and §9.3 is the differential
audit and the three limits it does not lift.

## Read, in this order

1. [AUTHORING.md](https://github.com/rig-c/core/blob/main/docs/AUTHORING.md) — `alphaClip` and per-vertex `depth` maps
   (§3.4, §3.4.5), slider constraints (§3.5.2), the `deform` timeline, `derive` and
   `transform` field by field (§4, §4.5.1, §4.11, §4.11.1), the failure map
   (§5–§6), `render --parallax <dial>` (§8.12), and the editor's conventions (§10).
2. [MOTION.md](https://github.com/rig-c/core/blob/main/docs/MOTION.md) — timing, easing and the offset table (§3),
   candidates and the ballot (§4–§5). A blink and a gaze are ordinary motion work.
3. [FACE.md](https://github.com/rig-c/core/blob/main/docs/FACE.md) — the face's own geometry: the closed form and
   `transform` (§1, §1.1), per-vertex depth sheets and turn ceilings (§2, §2.1,
   §2.2), the shared-shift hierarchy and `derive` (§3, §3.1), the 3×5 mesh and its
   silhouette cliff (§4), what foreshortens (§5), the blink and channel allocation
   (§6–§7), the three cliffs and the turn as a slider-driven value (§8), the deform
   audit gap (§9), and non-goals and `alphaClip` socket clipping (§11).
4. Then [RIGGING.md](https://github.com/rig-c/core/blob/main/docs/RIGGING.md) for the hierarchy as a general rule
   rather than this closed form, and [INGEST.md](https://github.com/rig-c/core/blob/main/docs/INGEST.md) if the head
   arrived as a compiled skeleton.

Every guide linked here is in the installed package at `node_modules/@rig-c/core/docs/`,
which is the copy that matches the rigc you run; the links go to the repository's
`main`. Inside the Claude Code plugin the same files are at `${CLAUDE_PLUGIN_ROOT}/docs/`.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
