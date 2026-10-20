#!/usr/bin/env bash
# The whole film, from the two key poses, in nine steps.
#
# Prereqs: bun, ImageMagick 7 (`magick`), node with playwright-core reachable
# (see vote/drive.mjs's import path), a network for the ballot's Spine Web
# Player, and the Andale-Mono font — macOS ships it, and it is the one mono face
# checked here that renders "→" AND leaves "--flag" as two dashes rather than an
# en dash.
#
# The character is NOT generated here. `art/parts/` and `spec/rigby.rig.json`
# are film one's, unchanged; poses and motions are the only new authoring.
set -euo pipefail
cd "$(dirname "$0")"

# 0. install the compiler
bun add rig-c@2.64.3

# 0b. ADAPTED for the repository (issue #342). In the scratchpad film one's four
#     shared inputs had simply been copied in beside this film's own; here they
#     are taken from film one's directory, so the art is referenced rather than
#     duplicated into films/. Two of the four are things film one's steps 1-2
#     WRITE, so they are made by running those two steps — neither needs film
#     one's `bun add`, both are pure bun + rsvg-convert + magick.
( cd ../one-assembly && bun art/make_parts.ts && bun spec/make_specs.ts )
mkdir -p art spec
cp    ../one-assembly/art/layout.ts       art/layout.ts
rm -rf art/parts
cp -R ../one-assembly/art/parts           art/parts
cp    ../one-assembly/spec/skeleton.ts    spec/skeleton.ts
cp    ../one-assembly/spec/rigby.rig.json spec/rigby.rig.json

# 1. the two key poses  ->  three motion specs (two stills + two candidates)
bun spec/make_specs.ts

# 2. compile all three: specs + the same PNGs  ->  skeleton.json + .atlas
bunx rigc build --rig spec/rigby.rig.json --motion spec/poses.motion.json   --images art/parts --out build-poses
bunx rigc build --rig spec/rigby.rig.json --motion spec/cheer-a.motion.json --images art/parts --out build-cheer-a
bunx rigc build --rig spec/rigby.rig.json --motion spec/cheer-b.motion.json --images art/parts --out build-cheer-b

# 3. the two gates no rigc instrument can see
#    - does the plate, and only the plate, still pin the framing box in all
#      three builds? (the film's crop depends on one shared viewport)
#    - does candidate B's overshoot put the paw on the face? (it did, once)
bun spec/check_framing.ts
bun spec/check_face_clear.ts

# 4. sample every build onto ONE shared viewport  ->  render-*/
bunx rigc render --candidate build-poses   --fps 20 --max 1296 --out render-poses
bunx rigc render --candidate build-cheer-a --fps 20 --max 1296 --out render-cheer-a
bunx rigc render --candidate build-cheer-b --fps 20 --max 1296 --out render-cheer-b

# 5. the two PICTURES: frame 0 of each still, cropped back to the plate
mkdir -p pose vote
magick render-poses/poseA@20fps/f0000.png -crop 1200x810+48+48 +repage -alpha remove -alpha off pose/poseA.png
magick render-poses/poseB@20fps/f0000.png -crop 1200x810+48+48 +repage -alpha remove -alpha off pose/poseB.png

# 6. read those pictures back with `rigc pose`.
#    MOTION.md §2.2: run the DEFAULT window once, read `search` and the scales
#    together, then narrow and run again — and say which window produced the
#    numbers you kept. Both runs are kept here; `*.json`/`*.log` (the narrowed
#    pair) are the ones the film quotes.
bunx rigc pose --images art/parts --frame pose/poseA.png --out pose/poseA.wide.json > pose/poseA.wide.log 2>&1
bunx rigc pose --images art/parts --frame pose/poseB.png --out pose/poseB.wide.json > pose/poseB.wide.log 2>&1
bunx rigc pose --images art/parts --frame pose/poseA.png --scale 0.88,1.0 --out pose/poseA.json > pose/poseA.log 2>&1
bunx rigc pose --images art/parts --frame pose/poseB.png --scale 0.88,1.0 --out pose/poseB.json > pose/poseB.log 2>&1

# 6b. did it read the picture? FK from the pose spec vs what `pose` measured.
#     The one real verification in this build — and not a grade of the movement,
#     which MOTION.md §0 and §7 say nothing in this toolchain can give.
bun spec/check_pose_reading.ts

# 7. do the two candidates differ in interpretation, and agree on both GIVEN
#    poses? (§4's wasted ballot and §5's `unsure` are the two failure modes)
bun spec/check_candidates_differ.ts

# 8. the ballot, a real vote through the page's own controls, the ledger
bunx rigc vote --candidate build-cheer-a --candidate build-cheer-b --out vote/ballot.html 2>&1 | tee vote/ballot.log
node vote/drive.mjs "$PWD/vote/ballot.html" "$PWD/vote" B preferred 2>&1 | tee vote/drive.log
rm -f vote/votes.jsonl   # the ledger refuses a repeat by design (V06); start clean
( cd vote && bunx rigc vote --record vote-from-browser.json --ballot ballot.html --ledger votes.jsonl 2>&1 | tee record.log )

# 9. crop back to the plate, downsample the 2x supersample, lay out the five
#    shots, draw the type, dissolve the joins, encode, verify  ->  the GIF
bun gif/assemble_gif.ts

# 9b. the same film at twice the size, for high-DPI pages  ->  rigc-keypose@2x.gif
#     (the supersample is not downsampled at all; type, panels and pointer are
#     drawn at 2x from the same layout)
bun gif/assemble_gif.ts --scale 2

# optional: the same winner in the official Spine Web Player — the interop proof
bunx rigc preview --candidate build-cheer-b --animation cheer --out preview.html
