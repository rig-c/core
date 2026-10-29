---
name: rigc-motion
description: Author a Spine animation with rigc from key poses — an idle, a loop, a move from one picture to another — with timing and spacing, ease in and out, anticipation, arcs, overlap, follow-through, squash and stretch, and candidate variants a person can choose between. Use when the request is a movement on an existing or planned rig, in the animator's words too: "animate this rig", "make it breathe", "go from pose A to pose B", "make it feel heavier", "the cape should follow through". Not for Live2D, separating an image into parts, or real-time tracking.
license: MIT
compatibility: Requires Bun 1.4 or later and the npm package @rig-c/core (rig-c is the convenience name).
---

# Motion — what goes between two poses

Load this when the request is a **movement rather than a skeleton**: a sentence of
intent, between zero and N pictures of what the movement passes through, and a
Spine animation somebody would choose coming back. Every rule below is owned by
[MOTION.md](https://github.com/rig-c/core/blob/main/docs/MOTION.md); this file says when to open it and what it will
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
- **The compiler never invents a value.** A key with no time, a curve with no kind, a
  bone the rig does not declare — each is refused by name before anything is
  written — AUTHORING §4 and §6.
- **The validator's messages are the instructions.** Read each named failure as the
  pointer to the file that has to change — AUTHORING §5.

## What this guide will not do

Nothing here grades a movement, and no instrument named here can. `build` says a
file is valid, `check` says how far it is from pictures you were given, and the one
thing that judges a movement is a person's eye through `rigc vote` — MOTION §0.

## Read, in this order

1. [AUTHORING.md](https://github.com/rig-c/core/blob/main/docs/AUTHORING.md) — the motion spec field by field (§4),
   the failure map (§5–§6), reading reference frames (§8) and checking against
   them (§9), what the editor does when nobody tells it otherwise (§10), and
   reading a pose out of a picture (§11–§12).
2. [MOTION.md](https://github.com/rig-c/core/blob/main/docs/MOTION.md) — the normal form every motion request
   reduces to (§0), timing, easing and the per-bone offset table (§3), and how to
   spread candidates so a ballot informs (§4–§5).
3. Then [RIGGING.md](https://github.com/rig-c/core/blob/main/docs/RIGGING.md) if the skeleton itself is what you have
   to decide; [FACE.md](https://github.com/rig-c/core/blob/main/docs/FACE.md) if the movement is a blink, a gaze or a
   head turn; [INGEST.md](https://github.com/rig-c/core/blob/main/docs/INGEST.md) if the rig arrived as a compiled
   skeleton rather than loose parts.

Every guide linked here is in the installed package at `node_modules/@rig-c/core/docs/`,
which is the copy that matches the rigc you run; the links go to the repository's
`main`. Inside the Claude Code plugin the same files are at `${CLAUDE_PLUGIN_ROOT}/docs/`.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
