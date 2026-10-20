#!/usr/bin/env bash
# The whole GIF, from nothing, in five commands.
#
# Prereqs: bun, ImageMagick 7 (`magick`), librsvg (`rsvg-convert`), and the
# Andale-Mono font (macOS ships it; it is the one mono face checked here that
# renders "→" AND leaves "--flag" as two dashes instead of an en dash).
set -euo pipefail
cd "$(dirname "$0")"

# 0. install the compiler
bun add rig-c@2.64.3

# 1. draw the twelve loose part PNGs + the stage plate  ->  art/parts/
bun art/make_parts.ts

# 2. write the rig and motion specs  ->  spec/rigby.{rig,motion}.json
bun spec/make_specs.ts

# 3. compile: specs + PNGs  ->  build/skeleton.json + build/skeleton.atlas
bunx rigc build \
  --rig spec/rigby.rig.json \
  --motion spec/rigby.motion.json \
  --images art/parts \
  --out build

# 3b. does the stage plate, and only the plate, decide rigc's framing box?
#     (if not, the crop in step 5 clips a part — see the file's own comment)
bun spec/check_framing.ts

# 4. sample all three animations onto ONE shared viewport  ->  render/
bunx rigc render --candidate build --fps 20 --max 1296 --out render

# 5. crop back to the plate, downsample the 2x supersample, draw the type,
#    splice the shots, encode  ->  rigc-demo.gif
bun gif/assemble_gif.ts

# 5b. the same frames at twice the size, for high-DPI pages  ->  rigc-demo@2x.gif
#     (the supersample is not downsampled at all; the type is drawn at 2x)
bun gif/assemble_gif.ts --scale 2

# optional: the same build in the official Spine Web Player
bunx rigc preview --candidate build --animation idle --out preview.html
