# Film three — scene direction

The film: [`assets/rigc-scene.gif`](../../assets/rigc-scene.gif), 198 frames, 600x405,
4 cs per frame (= 25 fps, 7.92 s), 3.11 MiB. It is the one in the README's gallery
section. Beside it, [`assets/rigc-scene@2x.gif`](../../assets/rigc-scene@2x.gif) is the
same film at twice the size for high-DPI pages: 198 frames, 1200x810, 4 cs per frame,
8.55 MiB.

**One continuous take.** Vela at rest and breathing, then her gaze aside, then the 2.5D
head turn — nothing cut between them, and no dissolve anywhere in the figure. That is a
property of the rig rather than of the assembler: `idle` loops, `gaze` and `turn` are
one-shots that return to rest, so `idle`'s last frame, `gaze`'s first, `gaze`'s last and
`turn`'s first are the same pose. Step 7 measures exactly that and gets 0 differing
pixels at the hand-offs. Only the type cross-fades.

## What it shows, beat by beat

The beat table is `gif/assemble_gif.ts`'s own output, not a restatement — this is the
block it printed on the run recorded below:

```
    0..  9   10 frames  0.40s  rest + build
   10.. 88   79 frames  3.16s  idle
   89..126   38 frames  1.52s  gaze
  127..131    5 frames  0.20s  turn 25fps
  132..162   31 frames  1.24s  turn 50fps (half speed)
  163..197   35 frames  1.40s  turn 25fps (hold + release)
  total       198 frames  7.92s at 25 fps
```

The type column names, under each beat, the command that produced the frames beside it.

The 2x file is the same beat table cut a second time, by `bun gif/assemble_gif.ts
--scale 2` (step 6b): every layout number stays in the 600 px picture's pixels and only
the drawing is multiplied, so the same bust window is downsampled less (`934x975 ->
688x718` where the 1x is `-> 344x359`). Type sizes are the one thing that is not a plain
doubling, because Andale-Mono's advance comes back a whole number of pixels: 18pt
advances 11px where 9pt advances 5, which would run the column's 44-character lines off
the canvas. So each size is drawn at the largest half-point size up to twice it whose
advance is no wider than twice the 1x advance — the run printed `9pt as 17pt=10px  14pt
as 27pt=16px  9.5pt as 19pt=11px`. Step 7 measures the 2x file too (`verify@2x.log`).

## The honesty stance

- **Everything on screen is compiled output.** No frame is drawn, retouched or posed by
  hand; the figure is `rigc render`'s PNGs, cropped and downsampled once.
- **Every caption figure is quoted from tool output, not typed.** The column's
  "22 parts · 27 bones · 22 slots" is lifted from `build`'s summary line in `build.log`;
  the shot list's durations are `explain`'s `declared=` values; the turn's five parallax
  rows are the bytes of `explain`'s own MEMBER rows in `explain.log`. Both logs are
  written by the run and read back by the assembler — which is why step 6 cannot be run
  without steps 1 and 2 having run first.
- **The film's claims are measured off the encoded file, not off the plan.** Step 7
  (`gif/verify_gif.ts`) coalesces the delivered GIF and measures the hand-offs, the half
  speed, the silhouette's two edges and the loop seam in final pixels.
- **Nothing here authors movement and nothing here draws Vela.** `portrait-src/` is
  `gallery/portrait` — rig, motion and the 22 part PNGs, unchanged. The film's only
  authoring is its own layout and type.
- **The compiler is the published package, not this repository.** `run.sh` step 0 is
  `bun add rig-c@…`, so the film advertises what a user gets from npm. `bunx rigc`
  therefore resolves to `films/three-scene/node_modules/`, never to `../../cli.ts`.

## Running it

```sh
cd films/three-scene
./run.sh
```

Prereqs are in `run.sh`'s own header: bun, ImageMagick 7 (`magick`), and the Andale-Mono
font. It writes into this directory and leaves the tree clean — everything a run produces
is covered by the repository `.gitignore` (see its `films/three-scene` block for the
list). The finished GIFs land here as `rigc-scene.gif` and `rigc-scene@2x.gif`; the ones
that ship are `assets/rigc-scene.gif` and `assets/rigc-scene@2x.gif`, and this README's
numbers are those files'.

## Preserved verbatim, and adapted

Preserved from the session that made the film, byte for byte: `gif/layout.ts`,
`tsconfig.json` — and `run.sh` (except the two blocks noted below) and `package.json`
were too, until the re-cut in the last row of the table. Every script
already addressed its files *relatively*, through `new URL('../', import.meta.url)`, so
**no path inside any script was ever re-aimed.**

Three adaptations in `run.sh`, all in the step `0b` block it now carries, and one in the
scripts:

| Adapted | Why |
| --- | --- |
| `portrait-src/` is copied from `../../gallery/portrait` at the start of every run | In the scratchpad it was a copy somebody had already made. Copying it from the example it is a copy *of* keeps the art referenced rather than duplicated into `films/`, and makes the header's "unchanged, byte for byte" a fact each run re-establishes. The two were verified byte-identical when this landed. |
| `mkdir -p probe` | Step 5's `tee probe/inkbbox.log` opens its log at pipeline start, before `measure_ink.ts` can create the directory. In the scratchpad `probe/` already existed from earlier work, so the ordering never showed. |
| nothing else in `run.sh` | the version pin in step 0 is left at what the run used — see below |
| `gif/assemble_gif.ts`, `gif/measure_ink.ts` and `gif/verify_gif.ts` each resolve the film's root with `fileURLToPath(new URL('../', import.meta.url))` where they used to read `new URL('../', import.meta.url).pathname` | `URL.pathname` is percent-encoded. Under a checkout whose path holds a space or a non-ASCII character these scripts created a sibling directory literally named `My%20Rigs`, wrote into it, and then failed with `ENOENT` on a directory that exists — so the film could not be re-run from such a checkout at all ([#558](https://github.com/rig-c/core/issues/558)). The URL each script builds is untouched; only its conversion to a path is. On an ASCII path the two spellings return the same string, trailing slash included, so no value any script computes moves and no output changes. |
| `run.sh` step 0 installs `rig-c@2.64.3` where it installed `spine-rigc@0.14.0`, steps 6b and 7 cut and measure the 2x file; `package.json` pins the same; `gif/assemble_gif.ts`'s `TAGLINE`/`TAGLINE_NAME` read `rig-c`, and it and `gif/verify_gif.ts` take `--scale` | the band named the package by the name it first shipped under ([#1503](https://github.com/rig-c/core/issues/1503)). `bunx rigc` is unchanged: `rig-c` ships the same `rigc` bin |

## What re-ran, and what did not

**Step 0 through step 8 re-ran end-to-end from this directory, and reproduced the
shipped GIF byte for byte.** `sha256` of `films/three-scene/rigc-scene.gif` after the
run equals `sha256` of `assets/rigc-scene.gif`
(`67b40fd9bf786346aed332987aa89cdc8a528df0b31daee128e234b01f35542c`), `build/skeleton.json`
is identical to the one the film was cut from, and `verify.log` came back with the same
figures line for line. That is a stronger result than frame-count-and-dimensions, which
was the bar.

**Version.** `run.sh` pinned `spine-rigc@0.14.0`, which is what made the GIF until the
re-cut below; the pin was left alone then because it was the record. The film was also re-run at
`0.14.1` — the version published since — from the same directory, with only that pin
changed, and **the output does not differ at all**: same `skeleton.json`, same
`skeleton.atlas`, the same GIF sha256 as above, and a `verify.log` identical line for
line. So either published version cuts this film.

**The re-cut on `rig-c@2.64.3`** ([#1503](https://github.com/rig-c/core/issues/1503)) ran
step 0 through step 8 again, plus 6b and the 2x half of 7. The beat table it printed is
the block above, line for line, and step 5's ink union is the one `gif/layout.ts` quotes
(x 113.1..531.2, y 13.3). The 1x file is not byte-identical to the `0.14.0` one — the
band names `rig-c`, and the figure pane differs in 0.75–0.83 % of its pixels (frames 5,
100 and 150) — but the loop, coalesced and compared on both files, leaves the same 8
pixels of the figure pane differing and the same 3,563 of the whole canvas (worst
channel 27/255 and 62/255 on the new one). On the render, step 7 again reads 0 differing pixels at the three
hand-offs the film cuts on and at every coinciding 25/50 fps sample; `turn` f0000 against
f0055 reads 136 and `idle` f0000 against f0080 reads 1,975, worst channel 57/255 for
both. On the 2x file: silhouette width 536 → 554 at the peak (far edge −6px, near edge
+12px), half speed 0.500 by edge travel and 0.606 by RMSE, 0 of 22 held frames in the
pane, loop 19 pane pixels (worst channel 47/255).

**Not re-verified.** The trailer at the bottom of `run.sh` lists nine probe logs kept
beside the film as evidence for claims in issue [#324](https://github.com/rig-c/core/issues/324)'s
landing comment. Only one of them, `probe/inkbbox.log`, is produced by a step in
`run.sh`; the other eight came from ad-hoc commands during the film's making and there
is no script here that regenerates them. Their conclusions are in the issues the trailer
names — [#336](https://github.com/rig-c/core/issues/336) (the loop seam against
`--max`) and [#337](https://github.com/rig-c/core/issues/337) (the last frame's time
against the declared duration) — which is where they are durable. The trailer is kept as
written so the list of what was measured is not lost.
