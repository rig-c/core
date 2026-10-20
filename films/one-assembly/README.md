# Film one — the assembly

The film: [`assets/rigc-demo.gif`](../../assets/rigc-demo.gif), 134 frames, 600x405,
5 cs per frame (= 20 fps, 6.70 s), 3.61 MiB. It is the one at the top of the README,
under *What you get*. Beside it, [`assets/rigc-demo@2x.gif`](../../assets/rigc-demo@2x.gif)
is the same film at twice the size for high-DPI pages: 134 frames, 1200x810, 5 cs per
frame, 7.91 MiB.

**Loose PNGs become a rig.** Fourteen part PNGs lie scattered on a stage with their
filenames beside them; they converge on the setup pose; the character breathes, blinks
and waves. All three of those are rigc-compiled Spine animations off one rig spec and
one motion spec — `assemble`, `idle` and `wave` — sampled onto one shared viewport by
`rigc render` and spliced here.

## What it shows, beat by beat

The shot list is `gif/assemble_gif.ts`'s own output, not a restatement — this is what it
printed on the run recorded below:

```
stage in frame: 1200x810+48+48 -> 600x405
shots: hold 10 + assemble 38 + idle 52 + wave 29 = 129
+ 5 dissolve = 134 frames (6.70s)
```

The 2x file is the same shot list cut a second time, by `bun gif/assemble_gif.ts --scale 2`
(step 5b): the label layout is solved once in the 600 px picture's pixels and only the
drawing is multiplied, so the supersample is cropped and not resized at all
(`stage in frame: 1200x810+48+48 -> 1200x810`) and the type is set at twice its size.

The 10-frame hold is `assemble` frame 0 with the filename labels at full opacity, fading
out over its last four frames — the film states its inputs before it moves them. Every
set's last sampled frame is dropped where the next set starts from the same pose
(`assemble`'s last frame *is* `idle`'s t=0, and `idle` loops), because keeping them would
hold two identical frames at each join.

## The honesty stance

- **Everything on screen is compiled output.** No frame is drawn, retouched or posed by
  hand. The figure in every frame is a `rigc render` PNG, cropped back to the stage plate
  and downsampled once — or, in the 2x file, not downsampled at all.
- **The two things that are not the animation are captions, and they say so.** The
  scattered filenames and the bottom band are drawn by the assembler; nothing else is.
- **The filenames are read out of the specs, not typed.** `gif/assemble_gif.ts` loads
  `spec/rigby.rig.json` and the source of `spec/make_specs.ts` and places each label at
  the scatter position the spec states, so a scatter the spec moves takes its label with
  it.
- **The crop comes from rigc's own sidecar.** The stage rectangle is computed from the
  viewport `rigc render` wrote into `render/frames.json`, not from a second copy of the
  arithmetic — and `spec/check_framing.ts` (step 3b) is there to check the one assumption
  that crop rests on: that the stage plate, and only the plate, decides the framing box.
- **The art is drawn from scratch.** `art/make_parts.ts` writes fourteen SVGs and
  rasterises them; no example asset, no traced reference. Nothing from Spine's example
  projects is anywhere in this film. (This is the same ground the demo GIF's own review,
  [#248](https://github.com/rig-c/core/pull/248), established for the art it ships.)

## Running it

```sh
cd films/one-assembly
./run.sh
```

Prereqs are in `run.sh`'s own header: bun, ImageMagick 7 (`magick`), librsvg
(`rsvg-convert`), and the Andale-Mono font. It writes into this directory and leaves the
tree clean — everything a run produces is covered by the repository `.gitignore` (see its
`films/one-assembly` block). The finished GIFs land here as `rigc-demo.gif` and
`rigc-demo@2x.gif`; the ones that ship are `assets/rigc-demo.gif` and
`assets/rigc-demo@2x.gif`, and this README's numbers are those files'.

Step 3b's `spec/check_framing.ts` imports `rig-c/render`, which links
`@esotericsoftware/spine-core`. The published package does not depend on it, so the
import resolves it from this repository's own install: run `bun install` at the
repository root before `./run.sh`.

**The art is generated, not committed.** `art/parts/` and `art/svg/` are step 1's output
and `spec/rigby.{rig,motion}.json` are step 2's, so they are not in git — the hand
authoring they come from is `art/make_parts.ts`, `art/layout.ts` and `spec/make_specs.ts`,
which are. Film two takes its parts from here by running those same two steps; see its
README.

## Preserved verbatim, and adapted

Preserved from the session that made the film, byte for byte: `art/layout.ts`,
`spec/skeleton.ts`, `tsconfig.json` — and `run.sh` and `package.json` were too, until the
re-cut in the second table below. Every script already addressed its files *relatively*,
through `new URL('…', import.meta.url)`, so **no path in this film was ever re-aimed**.

One adaptation for the repository, and it is mechanical:

| File | Adapted | Why |
| --- | --- | --- |
| `art/make_parts.ts`, `art/mock.ts`, `spec/make_specs.ts`, `spec/check_framing.ts`, `gif/assemble_gif.ts` | each resolves its own directory with `fileURLToPath(new URL('…', import.meta.url))` where it used to read `new URL('…', import.meta.url).pathname` | `URL.pathname` is percent-encoded. Under a checkout whose path holds a space or a non-ASCII character these scripts created a sibling directory literally named `My%20Rigs`, wrote the parts into it, and then failed with `ENOENT` on a directory that exists — so the film could not be re-run from such a checkout at all ([#558](https://github.com/rig-c/core/issues/558)). The URL each script builds is untouched; only its conversion to a path is. On an ASCII path the two spellings return the same string, trailing slash included, so no value any script computes moves and no output changes. |

Then the re-cut on the current package, with the name it ships under in the band and a 2x
file beside the 1x ([#1503](https://github.com/rig-c/core/issues/1503)):

| File | Changed | Why |
| --- | --- | --- |
| `run.sh`, `package.json` | step 0 installs `rig-c@2.64.3` where it installed `spine-rigc@0.8.0`; step 5b added | the band named the package by the name it first shipped under. `bunx rigc` is unchanged: `rig-c` ships the same `rigc` bin |
| `gif/assemble_gif.ts` | `CAP_NAME`/`CAP_LINE` read `rig-c`; a `--scale` argument multiplies the drawing | one layout, two sizes — see *What it shows* |
| `spec/check_framing.ts` | imports `rig-c/render` where it imported `spine-rigc/src/render` | the same module under the package's documented entry |

One preserved oddity worth naming rather than tidying: the motion spec's `cut` field is
`'gif-demo'`, the name of the scratchpad directory the film was made in. It is left as
it was because it is an input — editing it would change the emitted skeleton data, and
then this directory would no longer be the thing that made the GIF in `assets/`.

## What re-ran, and what did not

**Step 0 through step 5 re-ran end-to-end from this directory, and reproduced the shipped
GIF byte for byte.** `sha256` of `films/one-assembly/rigc-demo.gif` after the run equals
`sha256` of `assets/rigc-demo.gif`
(`c5dcf0e61a626c385c731893aab517cbdb889691f453b81793e60d419f932cd9`). Also identical to
the originals: all fourteen `art/svg/*.svg`, `spec/rigby.rig.json`,
`spec/rigby.motion.json` and `build/skeleton.json`. Step 3b's framing gate came back
green (*every quad corner of every sampled frame is inside the plate*), and the optional
step at the end wrote `preview.html` with all fourteen pages embedded.

**One difference, and it is metadata.** The regenerated `art/parts/*.png` are not
byte-identical to the originals: `rsvg-convert` writes a `tIME` chunk, so the wall clock
of the run is in the file. The pixels are not affected — ImageMagick's absolute-error
metric is 0 on all fourteen, and their raw RGBA streams hash identically — which is also
why `build/skeleton.json` and the GIF come out the same anyway.

**Nothing in this film is preserved-but-unverified.** Every step of `run.sh` ran,
including the optional `rigc preview` at the end.

**The re-cut on `rig-c@2.64.3` is not byte-identical to the `0.8.0` film, and is not
meant to be.** The band changed, and the figure did too, slightly: the same frames
compared above the band, old 1x against new 1x, differ in 1.3–3.9 % of their pixels at
0.12–0.19 % RMSE (frames 5, 30, 60, 100 and 130). The shot list, the 134 frames and the
600x405 canvas are unchanged; step 3b's framing gate came back green on the new build.
The assembler's own verify on the new files: fidelity mean 0.45 %, worst 0.50 % at frame
132 (1x) and mean 0.42 %, worst 0.48 % (2x); seam 2.50 % last→first against 1.43 % (1x)
and 1.69 % (2x) for a mid-shot step.
