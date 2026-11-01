---
name: rigc
description: Author, build and validate Spine 4.3 skeleton data (skeleton.json plus its .atlas) from loose part PNGs with rigc, the rig compiler that verifies its own output with named assertions before writing it. Use for any request to make a Spine rig or Spine animation from PNG parts, or where the source is a Live2D, Unity or video model whose pictures you can render, to run or read rigc build, validate, render, preview, check or vote, or to write or fix a *.rig.json or *.motion.json spec; it says which shipped guide to open for the need at hand. Not for Live2D conversion, cutting an illustration into parts, or real-time face tracking.
license: MIT
compatibility: Requires Bun 1.4 or later. The canonical npm package is @rig-c/core (bunx @rig-c/core, or bun add -d @rig-c/core); the command it installs is rigc. rig-c is the convenience install name; spine-rigc is the legacy install name.
---

# rigc — a rig compiler for agents

rigc compiles a rig spec and a motion spec into Spine 4.3 skeleton data and an
atlas, runs its named assertions — rigc's own validator in the published package,
held to a `@esotericsoftware/spine-core` round trip's verdicts in its CI, all but
the parse itself — and writes **only if every one is green**. You cannot see the
rig you are authoring. The validator's messages and the shipped guides are the
whole interface, and this skill only says which of them to open.

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

- **Validation is never bypassed.** `build` writes nothing on a red gate; there is
  no flag to skip it, and none may be added — AUTHORING §0 says so in as many
  words. Correctness is the whole of the reason: the assertions are what make the
  output trustworthy, and they are held to the official parser's verdicts in the
  repository's CI — all but the parse itself, which runs only where the runtime is
  installed and is reported as a SKIP elsewhere.
- **The compiler never invents a value.** A field the spec leaves out is a
  `CompileError` naming that field. Fill the spec; do not expect a default read off
  the art — AUTHORING §2 and §5.
- **The validator's messages are the instructions.** Each names the object, the
  value found and the value required, and AUTHORING §5 maps every named failure to
  the file that has to change.
- **A green gate cannot see a wrong animation.** If you were given pictures,
  `check` is the half of the loop that can; if not, `render` or `preview` and look —
  AUTHORING §0 and §9.

## Install

```shell
bunx @rig-c/core --help                  # run it without installing
bun add -d @rig-c/core                   # or pin it in the project; the command is `rigc`
bun rigc skills install                  # link this package's and every installed @rig-c/* package's skills into .agents/skills
bunx @rig-c/core skills install --copy   # in a consumer without @rig-c/core installed (for example, only @rig-c/play)
```

Codex, Gemini CLI and Antigravity read skills from `.agents/skills/` in the
workspace and none of them reads `node_modules`; `rigc skills install` scans this
package's `skills/` and every `node_modules/@rig-c/*/skills/<name>/SKILL.md` (and
rig-c alias package) in the project, and `rigc skills --help` says what it refuses.
In a consumer without `@rig-c/core` installed, run `bunx @rig-c/core skills install --copy`:
it reaches the project's `node_modules` from the working directory and writes plain
folders instead of linking `@rig-c/core`'s own skills into a temporary `.bunx` cache
that can be emptied.

The package links no Spine runtime. `build` writes `skeleton.json`,
`skeleton.atlas` and `skeleton.model.json`. `preview`, `vote`, `bench` and `bonedist`
run through `@esotericsoftware/spine-core`: install it beside
the package (`bun add -d @esotericsoftware/spine-core`) and the same `rigc` runs
them, and `build` runs the round trip as well. Without it those commands are refused
by name, while `build`, `validate`, `explain`, `diff`, `render`, `check` and `inspect`
(`--poser core|spine`) run on rigc's own core over `skeleton.model.json` —
`rigc --version` names the entry that ran (AUTHORING §0). In the parse's place that
`build` runs two rules of its own over rigc's model document, `A00_MODEL_READ` and
`A00_MODEL_REGIONS_ON_PAGES`; they are not registry assertions, so its summary
counts two more, and AUTHORING §5.2 has a row for each.

## The loop

1. `rigc build --rig <spec> --motion <spec> --images <dir> --out <dir>` compiles,
   gates (under `--profile spine`, the default, or `--profile rig-play`), and writes
   `skeleton.json`, `skeleton.atlas` and `skeleton.model.json` only on green.
2. Read the report. Every red line names the file to change; fix the spec and
   build again.
3. `rigc explain --rig <spec> --motion <spec> --out <dir>` when the red line is
   not enough — the compiled rig as a table: every bone with its resolved parent,
   the slots in draw order, every timeline key by key, and a `DEFORM` block per
   deform key. It takes no `--profile`, it never gates, and it writes nothing, so
   the figures are readable on a build the gate is refusing — AUTHORING §0 and
   §4.11.2.
4. `rigc render --candidate <out>` or `rigc preview --candidate <out>` — look at
   it. A rig with its head off its torso passes the gate; looking is what catches it.
   Open one frame at full size, not only `contact.png`: the sheet is for spacing
   across frames, and a defect is read on a frame. Ask it three things — is any
   picture drawn twice, is there a straight edge where the art has none, does a part
   cover a feature the art shows — and answer each with `render --hide <slot>` (or
   `--slot <slot,…>`), which draws the frame again without that part on the same
   grid, so the two frames say which part a pixel is. AUTHORING §0 holds the three.
   For motion and dial readings, `render --pass-through <cloth>:<leg>` names the
   frames where a cloth drawn over a leg passes through it (AUTHORING §8.5),
   `render --angle-range <bone>:<relative-to>` prints how far a bone turns against
   another (AUTHORING §8.7), `render --seam <slot>:<slot>` reads joint gaps,
   visible ghosts and background exposure (AUTHORING §8.8), and
   `render --parallax <dial>` reads a slider dial across its value grid
   (AUTHORING §8.12). When the question is geometry — is this bone where the art is,
   which way does it squash, where in rig units is this point —
   `rigc inspect --candidate <out> --show art,bones,names --dim` draws the bones
   over the art and writes a legend beside the picture that puts every mark back in
   world units; AUTHORING §13 maps each question to its view.
5. `rigc check --candidate <out> --frames <dir>` when you have reference pictures
   (`--out <dir>` writes the picture each of its numbers came from — open the worst).
   Read its output from the top: the framing block says whether the figures under
   it are about placement or motion. A figure is where the loop starts, not where it
   ends — keep the first green build's figure, check every later build against the
   same frames, and stop when the figure stops moving, not when it exists; AUTHORING
   §9.2 says how to read the framing block and the floor to read a figure against.
   `rigc vote --candidate <a> --candidate <b>` when several candidates are green and
   only a person can choose between them.
6. `rigc validate <out>` re-gates artifacts already on disk, and
   `rigc <command> --help` is each command's own flag table.
   `rigc repack <out> --out <dir>` packs a build again under `build --pack`'s
   packing flags when its parts were not kept, and writes only after every region and
   the skeleton are shown unchanged (`--keep-pages` refreshes `skeleton.model.json`
   over the existing atlas pages; `--accept-skeleton-differences` writes a rebuild
   whose skeleton differs, every difference printed; `--stage-box <slot>` reads a
   build's stage box) — AUTHORING §0.4. A mesh refused because its triangles are
   several pieces that share no vertex: `rigc split --rig … --motion … --slot <slot> --out <dir>`
   writes both specs back with one mesh per piece and every deform key renumbered —
   build that — AUTHORING §3.4.11.
7. Every finished unit ends with `rigc preview --candidate <out>` (or
   `rigc review <out>` when `@rig-c/review` is installed beside the project and a
   person reviews the build via its loopback URL, AUTHORING §0), and the report
   names the `.html` or URL it produced. The hand-off to a person is part of the
   work.

The loop in full, with `pose` before it and `chainfit` after the first build:
AUTHORING §0.

## When the source is not loose PNGs

A Live2D model, a Unity scene or a video is a player, not a set of parts. Make the
reference frames first: render the source at the rate you will check at, into one
directory of `f0000.png`, `f0001.png`…, and `rigc check --frames <that dir> --fps <rate>`
reads them with no `frames.json`. A port with no reference frames is unmeasured,
not finished. The parts are the source's own texture cut along its drawables, never
a screenshot: a screenshot is the composed result, and a part cut from it carries
every part under it. Where a part goes is its drawable's geometry — its vertices in
model space, its UVs, its triangles — which is a mesh attachment with those three
(AUTHORING §3.4, *Mesh attachment*); a region at the drawable's bounding-box centre
keeps only the box. rigc reads none of those formats — FACE §11, the paragraph
that opens *No Live2D file is read or written*
([FACE.md](https://github.com/rig-c/core/blob/main/docs/FACE.md#11-non-goals--stated-so-nobody-proposes-them-as-gaps)) —
only the pictures they produce. The rule, the background those frames need and
what a wrong one costs: AUTHORING §0, *When the source is a foreign player*.

## Which guide, for which need

Read [AUTHORING.md](https://github.com/rig-c/core/blob/main/docs/AUTHORING.md) first, whatever the need: the two
spec files field by field, the emission rules, the loop, and the failure map. Then:

| The request is… | Open | Skill |
| --- | --- | --- |
| a **skeleton** — how many bones, where each pivot sits, what hangs off what | [RIGGING.md](https://github.com/rig-c/core/blob/main/docs/RIGGING.md) | `rigc-rigging` |
| a **movement** — an idle, a loop, from this pose to that one | [MOTION.md](https://github.com/rig-c/core/blob/main/docs/MOTION.md) | `rigc-motion` |
| a **face** — a blink, a gaze, a head turn or a value-driven face dial | [FACE.md](https://github.com/rig-c/core/blob/main/docs/FACE.md) | `rigc-face` |
| a **skeleton.json somebody else authored** — read it, repair it, extend it | [INGEST.md](https://github.com/rig-c/core/blob/main/docs/INGEST.md) | `rigc-ingest` |
| you are the **person operating** the agent rather than the agent | [PROMPTING.md](https://github.com/rig-c/core/blob/main/docs/PROMPTING.md) | — |

Other `@rig-c/*` packages ship their own agent skills (`node_modules/@rig-c/<pkg>/skills/<skill>/SKILL.md`), which `rigc skills install` links beside these; load that skill for its tool's flags and rules:

| The request is… | Tool | Skill |
| --- | --- | --- |
| Turn one anime character painting and its See-through layer decomposition into a verified 2D character rig — measured parts, weighted meshes, bone chains and a looping idle | `@rig-c/parts` (`rig-parts`) | `rig-parts` |
| Clean and retarget a body-18 (or COCO-17) pose sequence onto a rig built by `rigc` or `@rig-c/parts` — bone rotate keys, hip translate keys, leg foreshortening, alternate-drawing switches and skirt-physics fitting | `@rig-c/pose` (`rig-pose`) | `rig-pose` |
| Hand a rig build or `rig-parts`/`rig-pose` output to a person for local inspection in a browser workspace (`rig-review open`) and retrieve their structured feedback (`rig-review feedback`), validate the delivery package (`rig-review check`), or export frame strips (`rig-review strip`) | `@rig-c/review` (`rig-review`) | `rig-review` |
| Play a rig built by `rigc` (`skeleton.model.json`) on a web page as plain DOM or a standalone `<canvas>`, with multi-track playback, attachment sets, wind and gravity physics, bone adjustments and live-frame borrowing | `@rig-c/play` (`rig-play`) | `rig-play` |
| Play a rig built by `rigc` (`skeleton.model.json`) inside a PixiJS 8 scene graph (`PixiRig` and `PixiRenderer`), posed through `@rig-c/play` with no Spine runtime | `@rig-c/pixi` | `rig-pixi` |
| Play a rig built by `rigc` (`skeleton.model.json`) inside a Phaser 4.2+ WebGL scene (`PhaserRig` and `PhaserRenderer`), posed through `@rig-c/play` with shared GPU page textures and no Spine runtime | `@rig-c/phaser` | `rig-phaser` |
| Play a rig built by `rigc` (`skeleton.model.json`) inside a native Three.js WebGL2 scene (`ThreeRig` and `ThreeRenderer`), posed through `@rig-c/play` under an orthographic or perspective camera with no Spine runtime | `@rig-c/three` | `rig-three` |

Every guide linked here is in the installed package at `node_modules/@rig-c/core/docs/`,
which is the copy that matches the rigc you run; the links go to the repository's
`main`. Inside the Claude Code plugin the same files are at `${CLAUDE_PLUGIN_ROOT}/docs/`.
Formats and the CLI reference: [AUTHORING §0](https://github.com/rig-c/core/blob/main/docs/AUTHORING.md#0-the-loop),
installed at `node_modules/@rig-c/core/docs/AUTHORING.md`;
existing skeletons: [INGEST](https://github.com/rig-c/core/blob/main/docs/INGEST.md);
licensing: [NOTICE](https://github.com/rig-c/core/blob/main/NOTICE.md).
