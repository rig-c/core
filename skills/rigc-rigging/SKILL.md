---
name: rigc-rigging
description: Decide a Spine rig's hierarchy with rigc — how many bones, where each pivot sits, what hangs off what, offsets, chains and what a chain can reach, siblings versus chains, constraints as structure — and which of those decisions the reference frames can check. Use when the request is a skeleton from loose part PNGs, such as "rig these parts", "make a Spine skeleton" or "where do the joints go", before any motion is authored. Not for Live2D, cutting an illustration into parts, or VTuber-style tracking.
license: MIT
compatibility: Requires Bun 1.4 or later and the npm package @rig-c/core (rig-c is the convenience name).
---

# Rigging — the hierarchy itself

Load this when the request is a **skeleton rather than a movement**: loose part
PNGs in, a bone hierarchy out. Every rule below is owned by
[RIGGING.md](https://github.com/rig-c/core/blob/main/docs/RIGGING.md); this file says when to open it and what it
will not do for you.

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
- **The compiler never invents a value.** A bone's `parent`, a slot's `bone`, a
  constraint's `target` resolve by name and a miss is refused by name; a missing
  number is a `CompileError` naming the field — AUTHORING §2 and §3.
- **The validator's messages are the instructions.** Read each named failure as the
  pointer to the file that has to change — AUTHORING §5.

## What this guide will not do

Nothing grades a hierarchy. A rig with its head off its torso passes the gate, the
pixels are nearly blind to structure, and the two instruments that see it at all
are named in RIGGING §11 — neither as a pass bar.

## Read, in this order

1. [AUTHORING.md](https://github.com/rig-c/core/blob/main/docs/AUTHORING.md) — the rig spec field by field (§3),
   the failure map (§5–§6), reading a pose out of a picture (§8.1, §11, §12),
   and the editor's own conventions (§10).
2. [RIGGING.md](https://github.com/rig-c/core/blob/main/docs/RIGGING.md) — the structure itself: what identifies a
   pivot and what moving one costs (§2–§3), gauges (§4), what a chain can reach
   (§6), and the instruments that see structure (§11).
3. Then [MOTION.md](https://github.com/rig-c/core/blob/main/docs/MOTION.md) once the skeleton exists;
   [FACE.md](https://github.com/rig-c/core/blob/main/docs/FACE.md) if the figure is a head;
   [INGEST.md](https://github.com/rig-c/core/blob/main/docs/INGEST.md) if the skeleton was handed to you already
   compiled.

Every guide linked here is in the installed package at `node_modules/@rig-c/core/docs/`,
which is the copy that matches the rigc you run; the links go to the repository's
`main`. Inside the Claude Code plugin the same files are at `${CLAUDE_PLUGIN_ROOT}/docs/`.

The install line and the build → validate → render → check loop are in the `rigc`
skill.
