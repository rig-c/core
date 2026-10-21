#!/usr/bin/env bash
# Film three, from the published package, in eight steps.
#
# Prereqs: bun, ImageMagick 7 (`magick`), and the Andale-Mono font — macOS ships
# it, and it is the one mono face checked here that renders "→" AND leaves
# "--flag" as two dashes rather than an en dash. And `bun install` at the
# repository root: step 8's `rigc preview` runs through @esotericsoftware/spine-core,
# which the published package does not depend on, so it resolves from that install.
#
# ⭐ Nothing here authors any movement and nothing here draws Vela.
# `portrait-src/` is a READ-ONLY copy of `gallery/portrait` at v0.14.0 — rig,
# motion and the 22 part PNGs, unchanged, byte for byte. The film's only
# authoring is its own layout and type.
#
# ⭐ And the compiler is the PUBLISHED package, not the repo: the film advertises
# what a user gets from npm.
set -euo pipefail
cd "$(dirname "$0")"

# 0. the compiler, as shipped
bun add rig-c@2.64.3

# 0b. ADAPTED for the repository (issue #342). In the scratchpad `portrait-src/`
#     was a copy somebody had already made; here it is made from the example it
#     is a copy OF, so the art is referenced rather than duplicated into films/.
#     Refreshed every run, so "unchanged, byte for byte" stays a fact.
#     `probe/` is created here because step 5's `tee` opens its log before
#     measure_ink.ts can create the directory.
rm -rf portrait-src
cp -R ../../gallery/portrait portrait-src
mkdir -p probe

# 1. compile the example as shipped.  22 parts -> skeleton.json + .atlas
#    build.log is kept: the column's "22 parts · 27 bones · 22 slots" is lifted
#    from its summary line rather than typed.
bunx rigc build --rig portrait-src/rig.json --motion portrait-src/motion.json \
                --images portrait-src/parts --out build > build.log 2>&1

# 2. what the turn's numbers ARE, printed beside the model that produced them.
#    explain.log is kept: the film's five parallax rows are its own bytes, and
#    the shot list's durations are its `declared=` values.
bunx rigc explain --rig portrait-src/rig.json --motion portrait-src/motion.json \
                  --out explain > explain.log 2>&1

# 3. the frames.  --max 1782 is chosen, not guessed: the viewport is 950.4 units
#    tall, and 1782 / 950.4 = 1.875 EXACTLY, so the 640x880 plate lands on
#    1200x1650 whole pixels and every art coordinate is an integer.
bunx rigc render --candidate build --fps 25 --max 1782 --out render

# 4. the same `turn`, sampled twice as densely.  Played back at 25 fps this is
#    half speed made of real poses — step 7 checks that the two sets agree
#    exactly wherever their sample times coincide.
bunx rigc render --candidate build --animation turn --fps 50 --max 1782 --out render-slow

# 5. where the ink actually reaches, over all 287 source frames, so the bust
#    window can clear it.  Writes probe/plate_frame.png, which step 7 reuses.
bun gif/measure_ink.ts 2>&1 | tee probe/inkbbox.log

# 6. crop to the bust window, downsample the supersample, lay the pane beside
#    the type column, name the command under each beat, encode, verify  -> the GIF
bun gif/assemble_gif.ts 2>&1 | tee run.log

# 6b. the same film at twice the size, for high-DPI pages  ->  rigc-scene@2x.gif
#     (the same window, downsampled less; type and rules drawn at 2x)
bun gif/assemble_gif.ts --scale 2 2>&1 | tee run@2x.log

# 7. the film's own claims, measured off the ENCODED file: the pose hand-offs
#    (why it needs no dissolves), the half speed, the parallax, the loop.
bun gif/verify_gif.ts 2>&1 | tee verify.log
bun gif/verify_gif.ts --scale 2 2>&1 | tee verify@2x.log

# 8. optional — the same build in the official Spine Web Player, the interop proof
bunx rigc preview --candidate build --animation turn --out preview.html

# ---------------------------------------------------------------------------
# probes kept beside the film, each one a claim in the landing comment
# ---------------------------------------------------------------------------
#   probe/encode_matrix.log     six encodes measured; why the GIF is -remap and
#                               not -colors (6.26 MiB -> 3.11 MiB)
#   probe/alpha_probe.log       what an #RRGGBB00 fill actually draws here
#   probe/inkbbox.log           the ink union the window clears
#   probe/seam_vs_max.log       the loop seam against --max          (issue #336)
#   probe/seam_isolate.log      the same, one track class at a time  (issue #336)
#   probe/seam_hold.log         a constant final segment is exact    (issue #336)
#   probe/seam_bisect.log       how close the endpoint pose is to 0  (issue #336)
#   probe/seam_nonint_fps.log   the last frame's time vs duration    (issue #337)
#   probe/seam_sample_time.log  gaze at two rates                    (issue #337)
