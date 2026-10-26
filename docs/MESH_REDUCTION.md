# Mesh reduction and topology-independent measurement — the shared contract

> The dependant is **rig-parts** (named spine-parts until 2026-10-09; its GitHub
> URLs redirect, its issue numbers are unchanged, and the versions this page
> cites were released under the old name).
>
> **Revision 2.** Agreed against
> [rig-parts#126, comment 6041707537](https://github.com/rig-c/parts/issues/126#issuecomment-6041707537),
> which answers P1–P20 and lists five contract corrections, read at parts
> `836ffb1` and rigc `2af8693`. Revision 1 (PR #1222) asked the questions; this
> revision records the answers, folds each into the interface it changes, and
> maps each correction to a control pair in *Stage A controls*. The answer
> settles the requested consumer behaviour; it does not assert that either
> repository has implemented it, and neither does this page.

Stage A of [#1221](https://github.com/rig-c/core/issues/1221), the upstream
half of [rig-parts#126](https://github.com/rig-c/parts/issues/126).
It is the contract both repositories agree on *before* any of stages B–D is
written. **Stage B1 ([#1224](https://github.com/rig-c/core/issues/1224))
implements the geometry measurement** — `measureMeshQuality` and the
`mesh-quality-report/1` document, in `src/meshquality.ts`, re-exported through
`rig-c/mesh` — and **stage B2 implements the reduction**: `reduceMesh`,
in `src/meshreduce.ts`, re-exported through the same entry. Every clause the
tree now does is marked **[implemented, #1224]** and says what the tree does,
cited by path and symbol; *The reduction as implemented* gathers the choices B2
had to make. **Stage C1 ([#1230](https://github.com/rig-c/core/issues/1230))
implements the motion comparison** — `compareMeshesInMotion`, in
`src/meshcompare.ts`, writing the `motion` section of the same document, and
**stage C2** gives it its named entry, `rig-c/meshcompare`, held from an
install with no spine-core by the install smoke (`MQ45`), and builds the rest
of its controls. Its clauses are marked **[implemented, #1230]**, and *The
comparison as implemented* gathers the choices C1 and C2 had to make. The page exists
so that a reader who was
not in the conversation that produced it can tell five things apart:

- **Existing** — what the tree already provides, cited by file path and
  symbol name (or a short quoted phrase where there is no symbol), never by
  line number, because line numbers move with nothing going red. Every
  existing number below was read off the source at v2.17.1, not restated from
  memory or from the issue. Facts about parts are cited the same way, as
  `rig-parts src/<file>` plus a symbol, and were read at parts `836ffb1`.
- **[agreed, rig-parts#126]** — decided by parts in the comment above. Each
  decision keeps its question number (**P1 … P20**) so the trail from question
  to answer survives.
- **[proposal]** — rigc's answer to something parts did not decide. Still
  unsettled until parts agrees, and an objection is held to the repository's
  usual standard: *it contradicts X*, *it cannot be measured*, *it breaks Y*.
  Every number on this page that parts did not state is a proposal.
- **Correction N** — one of the five corrections parts listed, applied to the
  interface or definition it names, each with a positive control and a planted
  failure in *Stage A controls*.
- **[implemented, #1224]** — what the tree does since stage B1, held by the
  `mesh-quality` suite's `MQ` controls in `selftest.ts`. Where the
  implementation had to decide something the contract left open, or had to add
  a field, the clause says so beside the mark rather than leaving the proposal
  text to imply it.
- **[implemented, #1230]** — what the tree does since stage C1, held by the
  `mesh-compare` suite's `MQ` controls in `selftest.ts`, under the same rule.

Ownership, as #1221 states it and as this page keeps it: **rigc** owns generic
geometry operations, measurable residuals and deterministic diagnostics;
**parts** owns authoring intent, region and bone name resolution, policy
orchestration and candidate selection; **the consumer** declares regions,
quality requirements and representative motion. rigc infers no anatomy and no
policy from a name.

## Inventory — what exists and what is new

| Concern | Existing (verified) | New (stage B–D) |
| --- | --- | --- |
| Alpha mask and threshold | `AlphaMask`, `artOf` (internal) in `src/mesh.ts`: art is alpha `>=` threshold; the threshold is a whole number in 1..255 ("the alpha threshold must be a whole number in 1..255", in both `buildContourMesh` and `buildSegmentsLattice`) | per-attachment art inputs, thresholds never exchanged (§1) |
| Silhouette trace, holes, islands, pinch | `traceAlphaOutline` in `src/mesh.ts`: largest 4-connected island, holes filled by an 8-connected background flood (`fillEnclosed(inside, w, h, 8)`), diagonal pinch refused on the filled silhouette ("the alpha silhouette pinches to a single point"); `fillEnclosed` is internal | none — reused |
| Outline simplification and offset | in `src/mesh.ts`: `simplifyClosedPolygon` (Douglas-Peucker), `offsetPolygon` (miter clamp `CONTOUR_MITER_LIMIT = 4`), `prunePolygon`, `findSelfIntersection`, `earClip` | constrained reduction with interior vertices (§1, §5, §6) — [implemented, #1224] `reduceMesh`, `src/meshreduce.ts` |
| Coverage and overshoot | in `src/mesh.ts`: `measureContourFit` (bounded search), `measureAuthoredMeshFit` (exact distance transform, internal `squaredDistanceToSet`), `MeshFitReport`, `CONTOUR_MIN_COVERAGE = 0.995`, `contourOvershootBound` | undercut (inward) distance, worst-sample location, raster sensitivity in each row's unit (§4) — [implemented, #1224] `measureMeshQuality`, `src/meshquality.ts` |
| Outline/hull/edges of a triangulation | `traceOutline`, `checkHullOrder`, `meshEdges` in `src/mesh.ts`; applied to every authored and generated mesh (`authoredHullAndEdges`, `generatedHullAndEdges`, `src/compile.ts`) | none — every reduced mesh passes through them |
| Generators | `ring`, `ribbon`, `grid`, `contour`, `segments` (`MeshKind`, `src/mesh.ts`); `buildSegmentsLattice`, `segmentShares` | an explicit reduction operation, never a new `generator` default (§1) |
| Weights | `bindWeightedVertices` in `src/mesh.ts` (bindings by bone name); `ModelBinding` (`src/model.ts`); A20 coherence (`src/assertions/bodies/a20.ts`) | explicit influence limits on every weighted call (§6) — [implemented, #1224] `reduceMesh`, `src/meshreduce.ts`, on every inserted vertex |
| Triangle sign, collapse, stretch | in `src/deformsurvey.ts`: `triangleAreas`, `DEFORM_AREA_EPSILON = 1e-6`, `float32AreaNoise`, `stretchSingularValues` | reused for orientation/degeneracy (§4) — [implemented, #1224] the first three and the band they make (`areaBand`) moved unchanged to `src/areaband.ts`, which `src/deformsurvey.ts` imports and re-exports, so the geometry entry reads the band without reaching the compiler |
| Deform measurement over time | deform survey (`surveyDeformKeys`, `src/deformmeasure.ts`; `surveyOfModel`, `src/deformsurvey.ts`), span scan (`scanDeformSpan`, `src/deformsurvey.ts`), A39 | none — a different question (it measures one mesh against itself, never two meshes against each other) |
| Posing | spine-core poser and rigc's core poser behind one seam (`src/render_shared.ts`, `src/render_core.ts`); `sampleAnimation`, `sampleSetupPose` and the `Frame`/`Mesh` pieces with world vertices, page UVs, triangles (`src/render_shared.ts`) | a comparison over a common UV domain through the core poser (§3) — [implemented, #1230] `compareMeshesInMotion` poses through `poseRawSetup` and `poseRawAnimationEach` (`src/core/raw.ts`), the walk `src/render_core.ts` steps with, not through the render seam |
| Two triangulations compared | **nothing.** `src/correspondence.ts` is a *bone* correspondence for `bonedist`/`bench` (`BONEDIST_SPEC`, `IDENTITY_CORRESPONDENCE`), not a mesh one | the whole of §3 — [implemented, #1230] `src/meshcompare.ts` |
| Report document | `build-report/1` (`src/assertions/report.ts`): versioned, additive, byte-identical for one build, no time or path | `mesh-quality-report/1` (§2) — [implemented, #1224] for `measure`: `writeMeshQualityReport`, `src/meshquality.ts` |
| Import surface for parts | `rig-c/mesh` holds 11 values and `AlphaMask` (RELEASING.md *The import surface*; `OBSERVED_SYMBOLS`, `scripts/install_smoke.ts`); `rig-c/render` needs spine-core installed beside it | `rig-c/mesh` (geometry) and `rig-c/meshcompare` (motion), §0 — [implemented, #1224] the geometry half: five values held by the smoke's `AGREED_IN_1224` row; [implemented, #1230] the motion half: `compareMeshesInMotion` and `uvCarriers` held by its `AGREED_IN_1230` row, and the comparison called from an install with no spine-core (`MESHCOMPARE_PROBE_SOURCE`, `scripts/install_smoke.ts`) |

## 0. Where the operations live, and what they never change

**Existing.**

- The named entries are the API and a symbol is promised only once a
  dependant is observed using it (RELEASING.md *The import surface*). Through
  `rig-c/mesh` parts is promised `traceAlphaOutline`, `traceOutline`,
  `earClip`, `offsetPolygon`, `prunePolygon`, `simplifyClosedPolygon`,
  `signedArea`, `findSelfIntersection`, `checkHullOrder`,
  `measureAuthoredMeshFit`, `MeshError`, and the type `AlphaMask`.
  `measureContourFit`, `meshEdges`, `buildSegmentsLattice` and `segmentShares`
  are exported by the module and **not** promised.
- `rig-c/render` loads `@esotericsoftware/spine-core` on import, which the
  package declares as a devDependency only since 2.0.0 (RELEASING.md, the
  paragraph after the *not promised* list). rigc's own core poser
  (`src/core/`, `src/render_core.ts`) links nothing of the runtime, and **has
  no named entry**.
- The install smoke already installs the package **without** spine-core and
  imports every observed entry with it taken away (`scripts/install_smoke.ts`,
  its `clean` scenario).
- `MeshError` (`src/mesh.ts`) extends `Error`, not `CompileError`; the
  compiler rewraps it as `CompileError` with the attachment's location
  (`authoredHullAndEdges`, `generatedHullAndEdges`, `src/compile.ts`).
- The emitted bytes of every existing generator are held by the step-1 hash
  gates against `tools/emit_hashes.base.json` (CLAUDE.md, *The selftest and its
  fixtures*).

**Agreed and proposed.**

- [implemented, #1224] Every new operation is an **explicit call**. No
  `generator` default changes, no existing generator gains an implicit
  reduction, and `compile` never remeasures or rewrites authored geometry on its
  own. The emit-hash gates are the proof that an unchanged spec emits unchanged
  bytes, and `EH06` and `MB07` hold the gallery's builds to that base on every
  run; `MQ26` holds that no module under `src/` but `src/mesh.ts`,
  `src/meshquality.ts`, `src/meshreduce.ts` and — since stage C1 —
  `src/meshcompare.ts` names any of the three operations, so
  nothing a build reaches calls them.
- [agreed, rig-parts#126] **P1 — `rig-c/meshcompare` is accepted.**
  Geometry-only operations (`reduceMesh`, `measureMeshQuality`) are exported
  from `rig-c/mesh`, which stays geometry-only; the motion comparison
  (`compareMeshesInMotion`) is exported from the new named entry
  `rig-c/meshcompare`. **Both** entries are held by an installed-package
  smoke with spine-core absent, the scenario the smoke already runs for the
  observed entries. [implemented, #1230] `compareMeshesInMotion`
  is exported from `src/meshcompare.ts`, which links nothing of the runtime
  (`CUR07` derives the linkers from the tree, and it is not among them) and
  nothing of the compiler; `exports["./meshcompare"]` in `package.json` names
  it, crossing no directory `files` does not already ship. The smoke holds it
  twice: the `AGREED_IN_1230` row of `OBSERVED_SYMBOLS` reads its two values
  through the entry with the runtime installed and imports the entry without
  it, and `MESHCOMPARE_PROBE_SOURCE` calls the comparison from the install
  with the runtime taken away (`MQ45`, *Stage A controls*). The
  `drop-meshcompare-entry` plant takes the key out of the packed map and has
  to go red at those steps alone, naming the entry.
- [agreed, rig-parts#126] **P2 — the core poser is sufficient for the
  initial production interface.** `compareMeshesInMotion` poses through rigc's
  core over the model document; no parts consumer gains a spine-core
  dependency, and a second poser backend is not a prerequisite. The report
  records the poser and its version (§2, `poser`); a measurement the core
  poser does not support is `refused` or `not-measurable` by name, never
  silently approximated. [implemented, #1230] `poser` is
  `{ kind: 'core', rigcVersion }`, the version read by `readVersion`
  (`src/package_meta.ts`, moved there unchanged from `src/cli/shared.ts` so a
  library module does not load the CLI to read it), and `null` when no schedule
  was given and nothing was posed; a build the core refuses to pose
  (`CoreInputError`) leaves every motion row `not-measurable` with the core's
  words. The upstream core-gate parity tests (`core_gate`,
  CLAUDE.md *The doctrine*) stay as they are; they are what makes the core's
  poses admissible.
- [implemented, #1224] Refusals are thrown as `MeshReductionError extends
  MeshError` with a readonly `code` (the codes are listed in each section
  below), so a dependant that already catches `MeshError` keeps catching them
  and one that wants the code can read it; the message opens with the code.
  The class is defined in `src/mesh.ts` beside `MeshError`, not in
  `src/meshquality.ts`: that module imports `src/mesh.ts`, which re-exports it,
  and a class extending `MeshError` at the top of the importing module would
  read `MeshError` before `src/mesh.ts` had run. [proposal] Inside `compile`
  they are rewrapped as `CompileError` exactly as `MeshError` is today —
  nothing in `compile` calls them yet.

## 1. Inputs, coordinate spaces, scaling, threshold, units, tolerances, order

**Existing.**

| Fact | Where |
| --- | --- |
| Positions are **part-local pixels, y down, origin top-left** | `MeshGeometry.points`, `src/mesh.ts`; the crop contract, CLAUDE.md *Conventions* |
| UVs are normalised over the part window, `v` from the top edge; a generator writes `x / w`, `y / h` on the 6-decimal grid | `MeshGeometry.uvs` and every builder's `uvs.push(r6(x / w), r6(y / h))`, `src/mesh.ts` |
| Triangles are **counter-clockwise in Spine world** (y up) — every generator since #1236; `contour` and `ring` emitted clockwise before (measured: *Stage C2*, the closed paragraph) | `MeshGeometry.triangles`, `src/mesh.ts`; `buildSegmentsLattice` swaps each y-down triangle's last two corners to keep it ("Emitted counter-clockwise in Spine world"), and `windCounterClockwiseInSpineWorld` does the same for the triples `buildContourMesh` (an `earClip` of the outline) and `buildRingMesh` (strips along the hull) build along a polygon that runs clockwise on screen; held on spine-core's posed world by `CT15` (`contour-mesh`) |
| Spine world is y up, origin bottom-left of the crop; the whole conversion is `src/transform.ts` | `cropToSpineY`, `toBoneLocal`, `toWorld` |
| A page that states `scale:` is traced on its texels; the author's distances are applied as `value × pageScale` texels, never a measured ratio | `ContourSpecInput.pageScale`, `src/mesh.ts` (issue #779); overshoot reported back in the drawing's pixels by dividing by the stated scale, `drawingOvershoot`, `src/compile.ts` |
| Alpha threshold: art is `alpha >= threshold`, a whole number in 1..255; generator default 1 | `buildContourMesh`, `src/mesh.ts`; `CONTOUR_DEFAULTS` and `SEGMENTS_DEFAULTS`, `src/compile.ts` |
| The authored-mesh fit is measured at threshold **1**, whatever the attachment's art | `measureAuthoredFit`, `src/compile.ts` |
| The generator grid: 6 decimals, never `-0`; emission then takes each number's float32 name | `r6`, `src/mesh.ts`; `f32`, `src/compile.ts`; `onModelGrid`, `src/compile.ts` |
| Geometric predicate epsilons | in `src/mesh.ts`: duplicate/collinear `1e-9` (`prunePolygon`); segment meeting `1e-9` (`segmentsMeet`); point-in-triangle `-1e-9` (`pointInTriangle`); degenerate raster triangle `|2A| < 1e-12` (`rasteriseTriangles`); ear turn `<= 1e-12` (`earClip`) |
| A pixel is covered when its **centre** is in or on a triangle — the renderer's convention | `rasteriseTriangles`, `src/mesh.ts` |
| Canonical order already fixed: hull first in walk order; walk starts at the lowest-numbered boundary vertex towards its smaller neighbour; `edges` = outline loop then interior edges sorted | `MeshOutline.walk` and `meshEdges`, `src/mesh.ts` |
| A segments vertex's weights: strongest first, ties in first-named order, the last closing at `1 − others` on the grid | `segmentShares`, `src/mesh.ts` |

**Existing in parts** (read at `836ffb1`; recorded because this contract must
not disturb them).

| Fact | Where |
| --- | --- |
| Parts's art is alpha **above** `ART_ALPHA = 8` — the same pixel set as rigc's `>= 9` | rig-parts `src/mesh.ts`, `ART_ALPHA`; its `artMask` in rig-parts `src/contour.ts` tests `alpha > threshold` |
| The contour fit hands rigc `threshold + 1` so rigc's `>=` reads parts's `>` | rig-parts `src/contour.ts`, `contourFit` calling `measureAuthoredMeshFit`, reached from `contourMesh` (the answer names the caller `assertContourFit`; no symbol of that name exists at `836ffb1`, and `contourFit` is the one that makes the call) |
| Rig-space regions are translated to part-local coordinates before the contour mesh is built | rig-parts `src/rig.ts`, the `contourAttachment` closure, mapping each region by the part origin before `contourMesh` |
| The minimum weight is applied inside the segment shares and **not** again to a region's scaled shares, so the declared ramp has no step | rig-parts `src/localweights.ts`, `localInfluences` and its header *The vertex's weights* ("The floor") |

**Thresholds — the agreed rule.** [agreed, rig-parts#126]

- **The existing parts path is alpha `> 8`, rigc `>= 9`, and stays
  byte-identical.** Nothing in this contract changes it.
- **P4 — the new automatic policy's final acceptance is measured at `>= 1`**,
  the threshold the compiler's authored-fit gate uses (`measureAuthoredFit`,
  `src/compile.ts`). Candidate construction may use another, explicitly
  recorded threshold; if it does, the reference **and** the selected candidate
  are measured again at `>= 1` under the same declared final bounds.
- **Evidence is never exchanged between thresholds.** A pass at `>= 9` is not
  a pass at `>= 1`, and the report keys every raster row by the threshold it
  was taken at (`art.threshold` in §2's row). A reference that cannot meet the
  final policy at `>= 1` is regenerated or refused; its art is never deleted
  to make it pass.
- The generic geometry operations still accept a caller-declared threshold for
  explicit research and measurement calls; such a call's report states that
  threshold and claims nothing at any other.

**Proposed** (with the decisions folded in). [implemented, #1224] Every type in
this block is declared in `src/meshquality.ts` with these fields.
`measureMeshQuality` reads `MeshMeasureInput`: the part of `MeshReductionInput`
a measurement needs, with three changes the implementation had to make — every
bound may be `null` and is then reported `undeclared` (`MeasureTargets`, in
place of `sourceBounds` and `targets`), and three inputs a measurement alone is
handed: the caller's `id` for the mesh, the `referenceHull` that
`MQ_BOUNDARY_DEVIATION` is taken against, and the P9 floors `minArtSamples` and
`regionArtSamples` (one per region, by name). [implemented, #1224]
`MeshReductionInput` is read by `reduceMesh` (`src/meshreduce.ts`), with four
required fields B2 had to add, each one the declared type left no place for:
`minArtSamples` and `regionArtSamples` (P9 makes the floor an input, and every
step is measured), `deform` (P18's keys, typed `DeformTimelineInput` and
`DeformKeyInput` in `src/meshquality.ts`) and `linkedMeshes` (the operation
lists every linked mesh, and the input has to name them for it to).

```ts
/** [proposal] The art one attachment is measured against. Correction 1: one per attachment, never shared. */
export interface ArtInput {
  /** The art, on the grid it is read off: the plate's pixels, or a `scale:` page's texels. */
  mask: AlphaMask;
  /** Art is `alpha >= threshold`. Required, a whole number in 1..255. Never exchanged (Thresholds). */
  threshold: number;
  /** The frame the caller's distances are in — P3. Echoed in the report, never inferred. */
  frame: SourceFrame;
}

/** [agreed, rig-parts#126] P3: the caller authors in drawing pixels, part-local, y down. */
export interface SourceFrame {
  space: 'part-local-drawing-px-y-down';
  /** The part window in drawing pixels. */
  width: number;
  height: number;
  /** The `scale:` the page states (1 when none) — the meaning of `ContourSpecInput.pageScale`. */
  pageScale: number;
  /** The conversion applied, stated rather than implied: texels = drawing px × pageScale. */
  conversion: 'texels = px * pageScale';
}

/** [proposal] Everything a reduction reads. No field has a default inside the operation. */
export interface MeshReductionInput {
  /** The attachment being reduced, echoed in every row. */
  attachment: AttachmentRef;
  art: ArtInput;
  /** The mesh to reduce, as the compiler would emit it — P8: the unreduced, independently gated source. */
  source: SourceMesh;
  /** Correction 3: what the SOURCE must already satisfy to be admissible (reference/art validity). */
  sourceBounds: ArtFitBounds;
  /** Correction 3: what the RESULT must satisfy; the source need not meet these and is refined towards them. */
  targets: ReductionTargets;
  /** Vertices, edges and influences the reduction may not remove or cross — §6. */
  protect: ProtectedFeatures;
  /** Required when `source.weights` is non-null — §6, P19. */
  influences: InfluenceLimits | null;
  /** Correction 1: the skeleton's bone order, used for every weight tie-break. Required when weighted. */
  boneOrder: string[] | null;
  /** P5: the preset parts expanded, if any, echoed and never read. */
  preset: { name: string; version: string } | null;
  /** Work bound — *Termination reasons*. Required. */
  budget: { maxCandidates: number };
}

export interface AttachmentRef { skin: string | null; slot: string; attachment: string }

export interface SourceMesh {
  /** Part-local pixels of the drawing, y down. */
  points: Array<[number, number]>;
  /** Region UVs, 0..1, `v` from the top — one pair per point. */
  uvs: number[];
  /** Counter-clockwise in Spine world; hull first, as `checkHullOrder` requires. */
  triangles: number[];
  hull: number;
  /** Per vertex, by bone NAME (`ModelBinding` without the bind coordinates), or null for an unweighted mesh. */
  weights: Array<Array<{ bone: string; weight: number }>> | null;
}

/** All distances in the drawing's pixels; converted to texels by `pageScale` exactly as `contour` converts. */
export interface ArtFitBounds {
  /** Share of art pixel centres the triangles cover, 0..1. Required. */
  minCoverage: number;
  /** Furthest a covered pixel may sit outside the filled silhouette, px. Required; null = declared absent (#1254). */
  maxOvershoot: number | null;
  /** Furthest an uncovered art pixel may sit from the covered set, px. Required; null = declared absent (#1254). */
  maxUndercut: number | null;
}

export interface ReductionTargets {
  /** The result's art fit — independent of `sourceBounds`, may be equal to it. */
  artFit: ArtFitBounds;
  /** P13: largest Hausdorff distance between the reduced and the source hull polygons, px. Required. */
  maxBoundaryDeviation: number;
  /** Optional: smallest interior angle any triangle may have, degrees. Undeclared = reported, not gated. */
  minAngle?: number;
  /** Local density requirements — §5. Empty array when none; a source that does not meet them is refined. */
  regions: RefinementRegion[];
}
```

- [agreed, rig-parts#126 items 4–5; #1254] **A distance bound may be
  declared absent.** `ArtFitBounds.maxOvershoot` and `maxUndercut` accept
  `null` wherever an `ArtFitBounds` is read — `reduceMesh`'s `sourceBounds`
  and `targets.artFit`, `measureMeshQuality`'s `targets.artFit`, and
  `compareMeshesInMotion`'s `referenceArtFit` and `candidateArtFit`. A `null`
  means exactly what §2 defines `undeclared` to mean: the row is measured, its
  value and worst sample are reported, its `bound` is null and its
  `nearBound` `clear`; it is neither `pass` nor `fail`, is not in the pass
  count, never satisfies a required claim, never refuses a source
  (`REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`) or a reference
  (`COMPARE_REFERENCE_FAILS`), and never blocks a step or acceptance — in
  `reduceMesh` the one predicate that says so is `artBoundAbsent`, read at
  admission and by `firstBlockingRow`. It is never read as 0, as an unbounded
  number, or as a pass. `EffectiveSettings` echoes the `null` in place
  (`sourceBounds`, `targets.artFit`, `referenceArtFit`, `candidateArtFit`), and
  the report writer serialises it as `null`. `minCoverage` has no such form and
  stays a required number in 0..1.

  **`undefined` and `null` differ on purpose.** A field left out is still
  refused by name (`REDUCE_INPUT_MISSING`, `COMPARE_INPUT_MISSING`), as are NaN
  and a negative number: an omission cannot be told from a caller that forgot
  the field, and "no field has a default" is the rule that keeps the report the
  record of what was declared. Only the explicit `null` is a declaration — the
  caller saying "measure this, do not bound it" — so only it is accepted. The
  widening is additive: an input that declares numbers is read exactly as
  before (the replay below).
- [agreed, rig-parts#126] **P3 — inputs are authored in drawing pixels.**
  Parts resolves every input to part-local drawing pixels, y down, before the
  call. Packing scale never changes the authored quality requirement: a bound
  stated in drawing pixels means the same art on any page. The report echoes
  the source frame, page scale and conversion (`ArtInput.frame`); **no scale is
  ever inferred from the packed page's dimensions.**
- [implemented, #1224] **Units.** Every caller distance is in the drawing's
  pixels; a measurement carries a point to the mask's grid as `px × pageScale`
  and reports a raster distance back as `texels / pageScale`, with the grid it
  was taken on in the row (`RasterSensitivity.grid`). A pixel a row names is a
  cell of the mask's grid. A fraction is a fraction; an angle is degrees.
  [implemented, #1224] A reduction converts no distance of its own: every bound
  a step is held to is read by `measureMeshQuality`, which carries a point to
  the mask's grid as above, so the reduction and the measurement cannot
  disagree about a unit.
- [agreed, rig-parts#126] **P5 — presets are parts's.** A preset is
  explicitly selected, versioned and expanded into numbers before the call;
  the report echoes its name, version and every expanded number. rigc
  publishes no preset table and derives no tolerance from an image. Existing
  explicit modes remain byte-identical. A missing number is a
  `MeshReductionError` naming the field (`REDUCE_INPUT_MISSING`).
- **Fixed tolerances are the tree's own.** [implemented, #1224] Predicates
  use the epsilons in the table above; zero-area is the A39 band —
  `max(DEFORM_AREA_EPSILON × largest |area| in the mesh, float32AreaNoise)`,
  `areaBand` in `src/areaband.ts`, read over the mesh's Spine-world
  coordinates — so a triangle the measurement calls degenerate is one the gate
  would also read no sign off. A reported px value is on the `r6` grid.
  [implemented, #1224] An inserted vertex's position and UV are on the `r6`
  grid, then `f32` at emission, as every generator's are; a surviving vertex
  keeps the source's numbers bit for bit (P19).
- [implemented, #1224] **Canonical output order** (byte-deterministic, A18),
  as `reduceMesh` writes `ReducedMesh` (`src/meshreduce.ts`). Two readings the
  implementation chose: an inserted vertex on the hull is a hull vertex and sits
  in the walk (item 1), so item 3 orders the inserted **interior** vertices; and
  the walk starts at an inserted vertex only when no source vertex is on the
  hull. Item 5 reorders a survivor's bindings and never their values.
  1. Hull vertices in outline walk order, starting at the surviving hull
     vertex with the smallest **source** index, in the source's direction.
  2. Interior source vertices that survive, ascending source index.
  3. Vertices the operation inserted (refinement only, §5), ascending by
     `(y, x)` on the `r6` grid.
  4. Triangles: each rotated so its smallest index is first, winding kept
     counter-clockwise in Spine world, then sorted lexicographically.
  5. `edges` from `meshEdges`; weights per vertex strongest first, ties by the
     bone's position in `boneOrder` (correction 1: the order is an input, so
     the tie-break is reproducible from the report alone).
- [proposal] **Refusals** (each names the object, the value found and the
  value required): `REDUCE_INPUT_MISSING`, `REDUCE_THRESHOLD_RANGE`,
  `REDUCE_MASK_SIZE` (mask bytes ≠ width × height, or the mask's dimensions
  are not the frame's `width × pageScale` by `height × pageScale`),
  `REDUCE_UV_RANGE` (outside 0..1 by more than A22's `1e-6`,
  `src/assertions/bodies/a22.ts`), `REDUCE_SOURCE_NOT_ONE_LOOP` (whatever
  `traceOutline` refuses), `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`.
  [implemented, #1224] `measureMeshQuality` throws the first four. Three
  readings the implementation chose: `REDUCE_MASK_SIZE` compares the mask with
  the frame's `width × pageScale` by `height × pageScale` on the `r6` grid, so a
  product that is not a whole number of texels is refused rather than rounded;
  `REDUCE_INPUT_MISSING` also names a field that is present and out of range
  (a coverage outside 0..1, a negative distance, a floor under 1) and a region
  name given twice, since no other code fits and the message says which; and
  `REDUCE_SOURCE_NOT_ONE_LOOP` — which also covers a stated `hull` the outline
  contradicts and an outline `checkHullOrder` refuses — is **reported**, not
  thrown, by a measurement: correction 3 requires a report whose
  `sourceCounts` is null, so the report carries an `unsupported-topology`
  termination with the code and `traceOutline`'s words. A measurement never
  throws `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`; it reports the source's fit as
  rows (`MQ19`). [implemented, #1224] `reduceMesh` throws the first four — and
  `REDUCE_INPUT_MISSING` for every field a reduction reads and a measurement
  does not (`sourceBounds`, a non-null `targets.artFit` — whose two distances
  may each be `null`, declared absent, but not left out — and
  `maxBoundaryDeviation`, `protect`, `influences` and `boneOrder` on a weighted
  source, `budget`, `deform`, `linkedMeshes`) — and **terminates** on the last
  two: `REDUCE_SOURCE_NOT_ONE_LOOP` as `unsupported-topology` with
  `sourceCounts` null, `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS` as `invalid-input`.
  The line between them: a malformed input is thrown, a well-formed request
  that cannot be met is the report's termination with no mesh (`MQ23`).
  [implemented, #1326] `REDUCE_INPUT_LINE`: a malformed `lines` (or, on a
  measurement, `lines` without `lineSource` or `lineSource` without `lines`),
  thrown by both operations before any work, in the same words (`validateLines`;
  §11 *The contract*, `MQ166`).
- **Correction 3 — source admissibility is not target density.**
  [implemented, #1224] `reduceMesh` measures the source with `sourceBounds` as
  its art fit and refuses on `MQ_COVERAGE`, the 8-connected `MQ_OVERSHOOT`,
  `MQ_UNDERCUT`, and — the source's own build gate — `MQ_ORIENTATION` and
  `MQ_DEGENERATE`; nothing in `targets` is read for admission (`MQ32`). An
  overshoot or undercut bound `sourceBounds` declares `null` is measured and
  admits on nothing — it is not one of those conditions (#1254, `MQ72`).
  `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS` (renamed from revision 1's
  `REDUCE_SOURCE_FAILS_ITS_OWN_CONSTRAINTS`) fires **only** on
  `sourceBounds` — the source's own art fit and its own build gate, the
  reference validity of §3. A valid source that is coarser than a requested
  region density is **refinable**, not refused: `targets.regions` and
  `targets.maxBoundaryDeviation` are things the result is driven towards,
  never admission conditions.

## 2. Geometry-only versus pose/motion-validated evidence — the report

**Existing.**

- A gate row is `PASS`, `FAIL`, `SKIP` with a reason, or `PROF` (not in the
  profile), and the summary counts each separately; `measured` is passed plus
  failed and never includes a skip (`GateSummary`, `src/assertions/report.ts`).
  An assertion with nothing to measure SKIPs and is never a pass (CLAUDE.md
  *Going public*).
- `build-report/1` is versioned and additive, keys in a fixed order, and two
  reports of one build are byte-identical — no time, path or machine
  (`src/assertions/report.ts`).
- The deform survey keeps "ran and found nothing" distinct from "did not run"
  (`DeformSpan`, `src/deformsurvey.ts`), passes over a key whose
  slot draws nothing by name rather than counting it (`DeformKeyDraw`), and
  records a predicted-but-unreproduced fold as `unconfirmed`, not as a pass or
  a failure (`DeformSpan.unconfirmed`).

**Proposed** (with the decisions and corrections 1–3 folded in). One document,
`mesh-quality-report/1`, written by both the geometry-only and the motion
operation. The two kinds of evidence are **two sections with two summaries**;
no figure anywhere adds them.

[implemented, #1224] for `operation: 'measure'`: every type below is declared
in `src/meshquality.ts`, `measureMeshQuality` fills one `CandidateReport` with
the caller's `id` in `candidates`, `reference` null, `poser` null,
`motionRequired` false and `motion` null, and `writeMeshQualityReport` writes
the text. Four additions the implementation needed, each additive: (1)
`EffectiveSettings.attachments[].regions`, each region's `{ name,
minArtSamples }` — P9 makes the floor an input and correction 1 echoes every
input, and `EffectiveSettings` had no place for it (§3's input carries it the
same way); (2) `EffectiveSettings.referenceHull`, the polygon the boundary row
was taken against; (3) `EffectiveSettings.targets` is `ReductionTargets |
MeasureTargets | null`, since a measurement's bounds may be undeclared; (4)
`ScheduleUsed`, which the interface names and does not define, was
`MotionSchedule` until stage C defined it — [implemented, #1230] the schedule as
given plus `ScheduleWalked` (`src/meshquality.ts`): every frame walked as a
`FrameRef` with its role, the roles present, `heldOutClaim`, the reset
(`'physics reset at time 0'`) and each walk's step count. A `measure` echoes its `finalThreshold`
as the threshold it was taken at: such a call claims nothing at any other.

[implemented, #1224] for `operation: 'reduce'`: `reduceMesh` fills one
`CandidateReport` with id `result` — the measurement of the canonical result
against `targets`, `art.threshold` and the source hull, so its rows are
`measureMeshQuality`'s and are keyed by the threshold they were taken at (P4) —
and exactly one `termination`; `effective` echoes `sourceBounds`, `targets`, the
source hull as `referenceHull`, and `budget`. One addition, additive and written
only when present: `CandidateReport.changes` (`ReductionChanges`), the figures
§6 says are reported and no row carries — vertices removed and inserted, shares
dropped on the weight grid and shares pruned by `InfluenceLimits`, the deform
keys remapped (each with the source vertices whose offsets were dropped) and
re-evaluated, and the linked meshes — and, last, `acceptedAt` ([implemented,
#1268]; one entry per accepted operation since [implemented, #1279]). It is
absent on a `measure` and whenever no mesh is returned. `effective` also echoes
a reduction's `stopAfterAccepted`, `boundaryRuns`, `motionAmplitude`,
`retriangulate` and `removalOrder`, each only when the input set it — `null`
included for `motionAmplitude`, and whether or not a mesh is returned
([implemented, #1283] for the last two, [implemented, #1287] for
`motionAmplitude`). With `retriangulate` set, `changes` ends in one more key,
`retriangulation` — which triangulation the returned mesh carries, and what the
operation does not promise about its steps (§8 *Stage B — triangulation
post-pass and weight-aware order*):

```ts
/** src/meshquality.ts [implemented, #1283] — written last in `changes`, only when the input set `retriangulate`. */
export interface Retriangulation {
  method: 'delaunay';
  /** The returned mesh carries the pass's triangles (true) or the removals' (false). */
  taken: boolean;
  /** Edge flips the pass made, and its sweeps over the interior edges (the last flipping none). */
  flips: number;
  sweeps: number;
  /** Null when taken; else the first required row that failed on the pass's result, or the flip bound reached. */
  refusedBy: string | null;
  /** The same sentence on every report: monotone validity along acceptedAt is not promised (§8 Q4). */
  monotonicity: string;
}
```

`acceptedAt` lists the accepted operations in the order taken, each written
with its keys in this order:

```ts
/** src/meshquality.ts [implemented, #1279] */
export interface AcceptedOperation {
  /** The attempt number — `candidatesTried` as it stood when the operation was taken, 1-based; strictly ascending. */
  step: number;
  /** A refinement insertion, one source vertex removed, or a boundary run replaced by one chord (§8). */
  kind: 'insertion' | 'removal' | 'boundary-run' | 'line-run'; // 'line-run': #1326, §11
  /** Vertices inserted (an insertion: 1) or removed (a removal: 1; a boundary run: 2 or more). */
  count: number;
  /** The source indices removed — each `null` in `indexMap` — in outline order for a run; `[]` for an insertion. */
  sourceVertices: number[];
}
// ReductionChanges.acceptedAt: AcceptedOperation[] — the counts sum to insertedVertices + removedVertices.
```

The unit is the operation, so `stopAfterAccepted: k` replays to the operation
at `acceptedAt[k − 1]` and `candidatesTried` of that replay is its `step`. A
call that does not set `boundaryRuns` takes only insertions and single
removals, so every count is 1 and the list's length is still
`insertedVertices + removedVertices`; only the entries' shape differs from
2.24.0, where each was the bare `step` number.

[implemented, #1374] With `explainKept` set (`'by-row'` or `'by-vertex'`),
`changes` ends in one more key, `kept` — what refused each kept source vertex,
written after `retriangulation` — and `effective` echoes the field. Left out,
neither is written and no refusal is measured that the run would not measure,
so the report and the mesh are the call's as they were. The reasons are read
from the last removal pass, the one that took nothing: every kept vertex that
is not protected was attempted there once as a single removal, on the mesh the
removals leave (before any `retriangulate` post-pass), and its refusal is read
in the state it was tried in — a refusal the deviation floor decided measured
in full to be named, exactly as `blockingConstraint`'s is, in that pass only.

```ts
/** src/meshquality.ts [implemented, #1374] — written last in `changes`, only when the input set `explainKept`. */
export interface KeptRefusals {
  /** The 1-based removal pass read; null when the run had no pass that took nothing. */
  pass: number | null;
  /** One entry per reason holding a kept source vertex, ascending by reason; boundary + interior sums to the kept source vertices. */
  rows: Array<{ reason: string; boundary: number; interior: number }>;
  /** `explainKept: 'by-vertex'` only: each kept source vertex, ascending, with the refusal's text (null when no attempt gave one). */
  vertices?: Array<{ vertex: number; boundary: boolean; reason: string; refusal: string | null }>;
}
```

A vertex is **boundary** when it is a source-hull vertex — a kept source vertex
is on the outline exactly then — and **interior** otherwise; vertices the
refinement inserted are never candidates and are not listed. A **reason** is the
refusal's constraint without the object an author named: a row's code
(`MQ_BOUNDARY_DEVIATION`, `MQ_COVERAGE`, `MQ_SKINNING_RESIDUAL`, `MQ_LINE_DEVIATION`,
…; the region or line it names stays in `refusal`) or the structural condition
the refusal opens with — `retriangulation`, `outline`, `protect (a)`,
`weightJump (b)`, `line`. A refusal that opens with none of them is a defect of
the reducer and is thrown rather than named. A vertex no attempt in such a pass
reached reads why, never an absence: `protected` (`protect`, or a line's end or
crossing), and, on a run with no pass that took nothing, the termination that
ended it — `budget-exhausted`, `replayed-to-accepted-step` — or
`no-removal-pass`, when the refined source does not meet its targets and no
removal is tried.

Both levels sit behind the field because naming costs measurements a run
without it does not make, and a default that moved every report's bytes would
not be additive. Within it the counts are the first level and the list the
second because the list grows by an entry per kept vertex (hundreds on a
production part) while the counts are what a policy is drafted from — *the
outline is held by the deviation bound, the interior by the residual* is two
rows. The two levels cost the same: the floor's refusals of the last pass are
measured to be named either way. This is the reading rig-parts took through `reduceMeshWith`'s attempt
observer (`tools/auto_policy_survey.ts`, the final pass by row, outline and
interior by the source hull), and the observer is what it is held to
(`MQ176`, `MQ177`).

```ts
/** [proposal] */
export type MeasureState = 'pass' | 'fail' | 'undeclared' | 'refused' | 'not-measurable';

export interface MeasureRow {
  /** Stable code, e.g. `MQ_COVERAGE`, `MQ_OVERSHOOT`, `MQ_LOCAL_DEFORMATION`. */
  code: string;
  /** The object measured: attachment always; region when the row is a region's. */
  object: { attachment: AttachmentRef; region: string | null };
  state: MeasureState;
  /** The measured value: present on pass, fail and undeclared; null otherwise. */
  value: number | null;
  /** The declared bound, inclusive: present on pass and fail; null on undeclared, refused, not-measurable. */
  bound: { op: '<=' | '>='; value: number } | null;
  unit: 'px' | 'world' | 'fraction' | 'degrees' | 'ratio' | 'count';
  /** Where the worst value was taken: present whenever `value` is. */
  worst: WorstSample | null;
  /** Required on refused and not-measurable: a sentence naming what was missing. */
  reason: string | null;
  /** Raster rows only: the art the row was taken against — never read across thresholds. */
  art?: { threshold: number; connectivity: 4 | 8 | null; samples: number };
  /** Raster rows only — correction 2, §4. */
  raster?: RasterSensitivity;
  /** Sampled rows (§4: `MQ_LOCAL_DEFORMATION`, fill distance) — correction 2. */
  sampling?: { domain: string; count: number };
}

/** [proposal] Correction 2: the spatial grid and the value's own granularity are two fields. */
export interface RasterSensitivity {
  grid: { width: number; height: number; pageScale: number };
  /** One texel, in the drawing's pixels: 1 / pageScale. A property of the grid, not of the value. */
  spatialQuantum: number;
  /** The smallest step the VALUE can take, in the row's own unit: px rows — spatialQuantum;
   *  fraction rows — 1 / art sample count; count rows — 1. */
  valueIncrement: number;
  /** `at-bound` when value equals bound exactly; `within-increment` when 0 < |value − bound| <= valueIncrement;
   *  `clear` otherwise. A diagnostic: it changes no verdict and bounds no error. */
  nearBound: 'at-bound' | 'within-increment' | 'clear';
}

export interface WorstSample {
  /** A pixel (raster rows), a triangle, an edge, a vertex, or a UV sample (motion rows). */
  at: { pixel?: [number, number]; triangle?: number; edge?: [number, number]; vertex?: number; uv?: [number, number] };
  /** Motion rows only — P7, P11: the frame, by stable id. */
  frame?: FrameRef;
}

/** [agreed, rig-parts#126] P7/P11: a frame is named by a stable id that carries animation, phase and time. */
export interface FrameRef {
  /** `setup`, or `<animation>@<phase>@<time on the r6 grid>`; the same frame has the same id in every report. */
  id: string;
  animation: string | null;
  phase: 'grid' | 'irr' | null;
  time: number | null;
  index: number | null;
  /** Whether the caller used this frame to choose a candidate. */
  role: 'selection' | 'held-out' | 'baseline';
}

export interface EvidenceSection {
  rows: MeasureRow[];
  /** Counts per state. `measured` = pass + fail. Never summed across sections. */
  summary: { pass: number; fail: number; undeclared: number; refused: number; notMeasurable: number; measured: number };
  /** pass only when every REQUIRED row is pass AND at least one row is pass; an undeclared row never satisfies a requirement. */
  verdict: 'pass' | 'fail' | 'not-measured';
}

/** One candidate's evidence — correction 1. `reduce` and `measure` carry exactly one. */
export interface CandidateReport {
  /** The caller's id for the candidate (§3, `BuiltCandidate.id`), or `result` for a `reduce`. */
  id: string;
  counts: MeshCounts | null;
  /** Null when no mesh exists to measure (correction 3). */
  geometry: EvidenceSection | null;
  /** Null when no motion was asked for — never an empty PASS (P6). */
  motion: (EvidenceSection & { schedule: ScheduleUsed }) | null;
  /** P6 — declared-contract acceptance, defined below. */
  accepted: boolean;
  /** Opt-in (P7): every row's value at every frame. Absent unless asked for. */
  perFrame?: Array<{ code: string; frame: string; value: number | null }>;
  /** [implemented, #1315] A comparison's candidate, opt-in (`MotionComparisonInput.overBound`): where its motion rows
   *  broke. Absent unless asked for; null when no motion section was measured; never on `reference`. */
  overBound?: OverBoundReport | null;
}

/** [implemented, #1315] The request: the most samples listed per row (a whole number >= 1, no default) and which
 *  triangles the per-triangle table lists. `null` and anything partial are refused (`COMPARE_INPUT_MISSING`, naming
 *  `overBound`, `overBound.maxSamples` or `overBound.triangles`) before any build is read. */
export interface OverBoundRequest { maxSamples: number; triangles: 'over-bound' | 'all' }

export interface OverBoundReport {
  /** Frames the selection named and the schedule walked — the frames `triangles` reads; 0 leaves every table empty. */
  selectionFrames: number;
  /** `MQ_LOCAL_DEFORMATION`'s attachment row, then each measured region's (by name), per attachment in skeleton order. */
  rows: Array<{ code: string; attachment: AttachmentRef; region: string | null; bound: { op: '<=' | '>='; value: number };
    /** Samples whose worst value over every frame walked fails the bound — all of them, listed or not. */
    total: number;
    /** At most `maxSamples`: worst first, then §3's domain order (art pixels row by row, then hull vertices). */
    samples: Array<{ at: { pixel?: [number, number]; vertex?: number; uv: [number, number] };
      /** The frame of the sample's worst value (the first such, in walk order); `role` says selection or held out. */
      frame: FrameRef; value: number;
      /** The candidate's UV triangle that carries the sample (§3), by index and by its three vertex indices. */
      triangle: number; corners: [number, number, number] }> }>;
  /** Per attachment, each motion row with a declared bound, codes in row order (`MQ_INVERSION`: the selection frames
   *  the triangle is reversed at; `MQ_LOCAL_DEFORMATION`: the largest distance of a sample it carries; `MQ_SQUASH`,
   *  `MQ_STRETCH`: the smallest and largest singular value) — over the selection frames only. Worst first, then
   *  triangle index; the over-bound triangles, or with `triangles: 'all'` every triangle with a reading. */
  triangles: Array<{ code: string; attachment: AttachmentRef; bound: { op: '<=' | '>='; value: number };
    values: Array<{ triangle: number; value: number }> }>;
}

export interface MeshQualityReport {
  spec: 'mesh-quality-report/1';
  operation: 'reduce' | 'measure' | 'compare';
  /** Correction 1: the inputs echoed with their structure, presets expanded — never a flat record of scalars. */
  effective: EffectiveSettings;
  /** P2: which poser ran and its version. Null on geometry-only operations. */
  poser: { kind: 'core'; rigcVersion: string } | null;
  /** Whether the caller required motion evidence (P6). */
  motionRequired: boolean;
  /** Null when the source could not be read as a mesh (correction 3: counts are never invented). */
  sourceCounts: MeshCounts | null;
  reference: CandidateReport | null;
  candidates: CandidateReport[];
  termination: Termination | null;
}

/** [proposal] Correction 1: every input the text requires, echoed field for field. */
export interface EffectiveSettings {
  preset: { name: string; version: string } | null;
  attachments: Array<{ attachment: AttachmentRef; threshold: number; finalThreshold: number; frame: SourceFrame;
    maskSize: [number, number]; minArtSamples: number }>;
  sourceBounds: ArtFitBounds | null;
  referenceArtFit: ArtFitBounds | null;
  candidateArtFit: ArtFitBounds | null;
  targets: ReductionTargets | null;
  motionBounds: MotionBounds | null;
  protect: ProtectedFeatures | null;
  influences: InfluenceLimits | null;
  boneOrder: string[] | null;
  schedule: MotionSchedule | null;
  budget: { maxCandidates: number } | null;
  /** [implemented, #1315] A comparison's `overBound`, echoed when set; absent otherwise. */
  overBound?: OverBoundRequest;
}

export interface MeshCounts {
  boundaryVertices: number;
  interiorVertices: number;
  triangles: number;
  /** Total `{ bone, weight }` entries over all vertices; 0 on an unweighted mesh. */
  bindings: number;
  maxInfluences: number;
}
```

- [implemented, #1224] **The five states, defined.** `pass`/`fail`: measured against a
  declared bound. `undeclared`: measured, and the caller declared no bound —
  the value and its worst sample are reported, and the row is **not** in the
  pass count. `refused`: the input to *this* measurement is invalid (a region
  outside the art, a bound below the grid), named by code. `not-measurable`:
  the input is valid and the measurement cannot be taken — no motion supplied,
  the slot draws nothing at every scheduled frame, fewer art samples than the
  declared minimum (P9), or the poser does not support the row (P2).
  [implemented, #1224] A row is **required** when the caller declared its
  bound; `MQ_ORIENTATION` and `MQ_DEGENERATE` are required with a bound of 0
  taken from the input's own definition (`SourceMesh.triangles` is
  counter-clockwise in Spine world, and a triangle inside the A39 band has no
  sign to show it), never from a guess. A row that cannot be measured is
  required exactly when its bound was declared, so a reader can tell from
  `effective` which unmeasured rows block acceptance. A row whose value has
  nothing worse than ideal to point at — coverage of every art pixel, no
  overshoot — carries `worst: { at: {} }`.
- [implemented, #1224] **Bounds are inclusive**, and a value exactly at its
  bound passes and carries `nearBound: 'at-bound'` (correction 2: boundary
  equality is handled explicitly, not left to a float comparison's mood).
- [agreed, rig-parts#126] **P6 — `accepted` stays, defined narrowly as
  declared-contract acceptance.** A candidate is `accepted` when its geometry
  section's verdict is `pass`, every required measurement is available (no
  required row `not-measurable` or `refused`), and — when `motionRequired` —
  its motion verdict is `pass`. An `undeclared` informational row never
  satisfies a required claim. Geometry-only acceptance stays visibly
  geometry-only: `motion` is `null` and `motionRequired` is false, so the
  report says *unmeasured*, never *passed*. With `motionRequired: true` and a
  motion verdict of anything but `pass` — including `not-measured` —
  `accepted` is false. Choosing among candidates and production acceptance
  remain parts's.
- [agreed, rig-parts#126] **P7 — each row carries its worst value and
  location, plus counts and the effective settings**; a per-frame table is
  opt-in (`CandidateReport.perFrame`) for diagnostics. Every worst motion
  sample names its frame by `FrameRef.id`, which carries the phase and a
  stable time — not a bare index — so a result is reproducible and can be
  located in selection or evaluation data.
- [implemented, #1224] Rows are ordered by section, then attachment in
  skeleton order, then code, then region; candidates in the order the caller
  listed them; the document is two-space JSON with a final newline and
  byte-identical for one input, as `build-report/1` is. As implemented: codes
  compare as strings, the attachment's own row (region null) before a
  region's, and where two fills are both exposed (P12) the gated 8-connected
  row before the labelled 4-connected one; every object is rebuilt in the key
  order its type states, so the bytes do not depend on the order an input was
  built in (`MQ25`).
- [implemented, #1280] **Three additive fields**, each written only when
  present, for §8's allocation rows: `MeshMeasureInput.motionAmplitude` (the
  declared amplitude, optional; `null` declares it absent), echoed as
  `EffectiveSettings.motionAmplitude` when the input set it; and
  `MeasureRow.allocation` (`AllocationDetail`: `reading`, and `contrast` or
  `search` on the row that has one), written on the five allocation rows and
  no other. The five rows are geometry rows like any other: sorted by code
  with the rest, counted in the section's `summary`, never required. A report
  of an input that declares nothing new is the report it was before but for
  those five rows and the summary counts they add (§8, *Implemented — the
  allocation rows*; `MQ124`, `MQ126`).
- [implemented, #1287] **A fourth, on the reduction**:
  `MeshReductionInput.motionAmplitude`, the measurement's field with the
  measurement's handling — left out, not declared; `null`, declared absent;
  anything else refused `REDUCE_INPUT_MISSING` naming its path, before any
  work — read by the result's own measurement only, so a `reduce` report's
  `MQ_ALLOCATION_CONTRAST` and `MQ_DEFORM_LOAD` are measured when the call
  declares it, and echoed in `effective` as above. A call without it writes
  the bytes it wrote before (§8, *Stage B — the amplitude on a reduction*;
  `MQ109`, `MQ110`).
- [implemented, #1294] **One more input, row and pair of keys**, each written
  only when the input set the field: `MeshMeasureInput.skinning`
  (`SkinningResidualInput | null`, `src/meshskinning.ts`) — the source the
  measured mesh is a candidate of, the envelope, `maxResidual` and the deform
  timelines; the geometry row `MQ_SKINNING_RESIDUAL` (drawing px, required when
  `maxResidual` is a number, sorted by code with the rest); `MeasureRow.skinning`
  (`SkinningDetail`), written on that row when it is measured and on no other;
  and `EffectiveSettings.skinning` (`SkinningEcho | null`), the input with the
  source as `{ id, digest }`, written last in `effective`. Left out, there is no
  row and no key, and the report is the one written before (§7, *Mechanism 1 —
  implemented, the measurement half*; `MQ132`).
- [implemented, #1295] **One more reduction input, and its echo**:
  `ReductionTargets.skinning` (`ReductionSkinning | null`, `{ envelope,
  maxResidual }`, `src/meshskinning.ts`), measured against the call's own
  `source`. Set with a number, every removal, boundary run and post-pass is
  also held to `MQ_SKINNING_RESIDUAL`, a refusal by it is named like any row's
  (`MQ_SKINNING_RESIDUAL: <value> against <= <bound>`, in `refusedBy`,
  `blockingConstraint` and `retriangulation.refusedBy`), and the result's
  measurement carries the row as the measurement writes it. The echo is
  `effective.targets.skinning`, after `regions`, written only when the input
  set the field — `null` included. The report has no place for work, so the
  carried state's work (samples recomputed, containment tests, triangles,
  memory) is counted on its tally (`CarryTally`), read by the controls and
  stated in §7, not reported. Left out, the call writes the bytes it wrote
  before (§7, *Mechanism 1 — implemented, the reducer half*; `MQ140`).

## 3. Comparing different triangulations on a common domain

[implemented, #1230] as *The comparison as implemented* states, below *The
reduction as implemented*; the clauses here keep their marks, and each one C1
implements says so beside it.

**Existing.**

- Nothing compares two meshes. The deform survey compares a mesh with
  **itself** — the deformed key against the same posed bones with the deform
  cleared (`src/deformmeasure.ts`, header *The frame*).
- A deform moves positions and never UVs, so UV-rasterised coverage is
  identical at every key — stated, and controlled by `DR04`
  (`src/deformmeasure.ts`, header *What is deliberately NOT here*).
- A posed frame's mesh piece carries world vertices, **page** UVs and triangles
  (`Mesh`, `src/render_shared.ts`); page UVs depend on where the
  region was packed, region UVs do not (A22's note, `src/assertions/bodies/a22.ts`).
- Sample times: the render walks `count = round(duration × fps)` poses at
  `i / fps` (`sampleAnimation`, `src/render_shared.ts`); the
  protocol rate is `PROTOCOL_FPS = 12` (`src/render_shared.ts`). The pose
  oracle's phases are `grid`, `off`, `irr`, `dense` (`SamplePhase`,
  `src/core/animation.ts`), with `IRR_OFFSET = 0.381966011` and the times
  `sampleTime` returns, both in the same file.
- Physics: the render resets at pose 0 and steps by `1/fps` after
  (`src/render_core.ts`); the oracle's stepped schedule starts at 0
  with the reset and steps by `dt` (`stepSchedule`,
  `src/core/constraints_physics.ts`), default `dt` 1/60
  (`ORACLE_DEFAULT_DT`, `tools/pose_oracle.ts`). **No warm-up exists
  anywhere in the tree.**
- A rig may exempt a slot from A39's fold rule (`invariants.deformMayFold`,
  `src/rig.ts`).

**Proposed** (with the decisions and corrections 1, 4 and 5 folded in).

```ts
/** [proposal] */
export interface MotionComparisonInput {
  /** P8: the unreduced, independently gated source build. Required — no pairwise-only acceptance. */
  reference: BuiltCandidate;
  candidates: BuiltCandidate[];
  /** Correction 1: per attachment, its own art, threshold, frame and sample floor. */
  attachments: Array<{ attachment: AttachmentRef; art: ArtInput; finalThreshold: 1; minArtSamples: number;
    regions: Array<{ name: string; polygon: Array<[number, number]>; minArtSamples: number }> }>;
  /** Correction 1: the reference and the candidates are held to independently declared art-fit bounds. */
  referenceArtFit: ArtFitBounds;
  candidateArtFit: ArtFitBounds;
  schedule: MotionSchedule;
  bounds: MotionBounds;
}

export interface BuiltCandidate {
  /** Correction 1: the caller's identity for the candidate, unique within one call, echoed in its report. */
  id: string;
  /** The model document and the Spine pair it was written beside. */
  build: { modelPath: string; skeletonPath: string; atlasPath: string };
}

export interface MotionBounds { maxLocalDeformation: number; maxStretch?: number; minStretch?: number }

export interface MotionSchedule {
  /** P11: explicit frames, supplied by parts — setup, and per animation either explicit times or a rate. */
  frames: Array<'setup' | { animation: string; times: number[] } | { animation: string; fps: number }>;
  /** Sample phases each animation is walked at; the verdict must hold at every one. */
  phases: Array<'grid' | 'irr'>;
  /** P10: `warmupSteps` must be 0 until warm-up exists; any other value is refused by name. */
  physics: { mode: 'none' } | { mode: 'step'; dt: number; warmupSteps: 0 };
  /** P11: frame ids the caller used to SELECT a candidate. Every other non-setup frame is held out. */
  selection: string[];
}
```

- [proposal; implemented, #1230] **The common domain is the attachment's region UV square**, not
  its page UVs and not vertex indices. UVs are the one attribute a deform never
  moves and a repack never changes, so a UV point names the same texel of art
  in every candidate at every frame.
- [proposal] **The sample set** is the centre of every art pixel of the mask,
  `((x + 0.5) / w, (y + 0.5) / h)` for each pixel with `alpha >= threshold`,
  plus every reference hull vertex's UV. Each sample is located by barycentric
  coordinates in each candidate's UV triangulation and carried to world by that
  triangle's posed vertices. A sample that lies in no triangle of a candidate
  is **not dropped**: it counts against that candidate's coverage and is
  listed. [implemented, #1230] at the final threshold (`finalThreshold`, P4);
  an uncarried sample is listed by UV in the local-deformation row
  (`MotionRowDetail.uncarried`, for the reference's mesh and the candidate's)
  and left out of the distance; the coverage it costs is the setup art fit's
  `MQ_COVERAGE`.
- **Correction 4 — the comparison map is unambiguous or refused.** A sample
  whose UV lies in more than one triangle of a candidate — overlapping or
  degenerate UV triangles — would otherwise be carried by an arbitrary one.
  [proposal] It is refused by name (`COMPARE_UV_CARRIER_NOT_UNIQUE`, naming the
  candidate, the sample's UV and every triangle that contains it). The one
  exception is a sample on an edge or vertex **shared** by the triangles that
  contain it: there the carriers agree on the carried point by construction,
  and the hit is one hit. A UV triangle inside the A39 area band carries
  nothing and is never chosen as a carrier. [implemented, #1230]
  `uvCarriers` (`src/meshcompare.ts`; defined in `src/meshcarriers.ts` since
  #1294, which the skinning residual shares, and re-exported where it is
  promised): containment is each barycentric
  coordinate at least `−1e-9`, `pointInTriangle`'s epsilon (`src/mesh.ts`),
  applied to the coordinates rather than the cross products so it does not
  scale with the UV square; "shared" is read off vertex indices — every
  containing triangle has the same corners at nonzero weight, one or two of
  them — so two triangles that meet at one place through duplicated vertices are
  refused, not excused; the band is `areaBand` over the UVs.
  [implemented, #1323] **"Across a shared edge or vertex" is read to the
  distance the slack allows.** Where the per-coordinate support above
  refuses, `resolveCarriers` (`src/meshcarriers.ts`) reads it again by
  `slackSupport`: a corner is in a hit's support when the sample lies further
  than `1e-9 × H` (UV units) inside it — its barycentric coordinate times its
  height over the opposite edge — with `H` the widest triangle height among the
  hits, the furthest outside a triangle the containment test admitted any of
  them. The slack is per coordinate, so in distance it is 1e-9 times a corner's
  height: a sample a hair beside a shared edge is admitted by the triangle it is
  outside of, while a sliver on the other side, whose height is small, reads its
  far corner's coordinate above 1e-9 — two per-coordinate supports, read as an
  overlap. Measured on the public reproduction (demo/bottomwear at source
  spacing 12 and 18, the result 282 + 0): the pixel centre (216.5, 56.5) lies
  exactly on the result's edge 263–265, (215, 58)–(219, 54), in px; the UVs,
  rounded to six places, put it 1.35e-10 uv to the side of the sliver
  (263, 265, 264) — coordinates −3.2e-10 on the far triangle's third vertex
  (height 0.42 uv) and +6.5e-8 on the sliver's (height 0.0021 uv), the same
  1.35e-10 either way. No fold: all 280 triangles wind one way in px and in UV,
  no interior edge has both third vertices on one side, and their areas sum to
  the outline's (twice the area, 705960 px², both). A sample two triangles both
  hold further inside than the slack — an overlap or a fold — is still refused;
  every sample the per-coordinate rule resolves is carried as before, so the
  change reaches only inputs that were refused. The skinning residual reads the
  same function with the working mesh's UVs (#1294, #1295), so a reduction step
  its veto refused on such a tie (`SKINNING_UV_CARRIER_NOT_UNIQUE`) is taken
  now.
- [agreed, rig-parts#126] **P9 — `minArtSamples` is an explicit positive
  integer input with no hidden rigc constant.** [proposal] It is stated **per
  attachment** (required) and **per region** (required for every region whose
  rows are required); the report states the observed count separately for each
  domain (`MeasureRow.art.samples`). Hull-vertex samples do not count towards
  it. A domain under its floor is `not-measurable` with its count, never a pass
  over nothing. [implemented, #1230] for the attachment's
  and each region's `MQ_LOCAL_DEFORMATION` row; a region's samples are those
  whose UV, carried to the frame's drawing px, lies in its closed polygon. The
  floors' control is `MQ21`'s motion half, printed as `MQ60`
  (`mesh-compare`): a floor one above the art count is `not-measurable` naming
  the count though the hull samples would meet it, for the attachment and for a
  region. A value of 1 is admissible for an explicitly chosen geometry
  investigation of a nonempty part; it is not a production floor, and parts
  supplies the number from its declared policy or versioned preset.
- [proposal] **Coordinate alignment is by construction, never by fitting.**
  No registration, translation or scale is solved for, and no alignment is
  ever fitted to the output vertices — a solved alignment would hide exactly
  the error being measured.
- **Correction 5 — equality covers every non-mesh input.** Identical bone
  rosters and setup transforms are necessary and not sufficient: a changed
  constraint, attachment transform, skin or slot attachment schedule, motion
  track or physics setting confounds the comparison. [proposal; implemented, #1230, the allowlist as
  `allowed` in `src/meshcompare.ts` spells it] Reference and
  candidates must be equal in **every input not on the allowlist**, compared
  on their model documents, or the comparison is refused
  (`COMPARE_INPUTS_DIFFER`, naming the first differing object and field and
  both values; revision 1's `COMPARE_SKELETONS_DIFFER` is its bone-only
  special case and is retired into it). The allowlist is exactly:
  (a) the compared attachments' vertices, UVs, triangles, hull, edges and
  bindings; (b) what follows from them by topology — deform runs remapped
  under §6's rule and `transform` deform keys re-evaluated over the new
  geometry; (c) atlas layout — page, region placement and rotation — provided
  each candidate's page UVs convert back to its region UVs. Nothing else may
  differ.
- [proposal] **A permitted fold stays visible.** A slot exempted by
  `invariants.deformMayFold` remains outside `MQ_INVERSION`'s count as A39
  rules, and its folded triangles are **listed** in the row's diagnostics with
  their frames; the row never reports zero for them. [implemented, #1230] such
  a slot's row holds no bound — `undeclared` — and its value is the fold count,
  with every fold in `MotionRowDetail.folds`; `MQ38`, its control, is printed
  as `MQ63` (`mesh-compare`): the same fold count fails a bound of 0 on the
  same rig without the exemption.
- **Correction 4 — units.** [proposal] Distances are in Spine world units, the
  primary error. A single world-units-per-pixel ratio is invalid under
  nonuniform scale or shear, so it is not reported. Each row instead states
  the **declared** setup map from part-local drawing pixels to world — the
  placement the compile used (`cropToSpineY`, `toBoneLocal`, `toWorld`,
  `src/transform.ts`), read from the build and never measured from vertices —
  as its 2×2 linear part with its two singular scales. [implemented, #1230] as
  the slot bone's setup world 2×2 — `[a, b, c, d]` as the core poses the bone
  from its declared fields — with its singular scales
  (`MotionRowDetail.setupMap`, on every `world` row). It is the slot bone's map
  and is named so: a weighted vertex is carried by its own bones, and no single
  map is claimed for it. Where no single
  declared map exists for an attachment, the conversion is reported as
  `refused` with a reason and the world-space row stands alone.
- [agreed, rig-parts#126] **P10 — no warm-up in v1.** Physics resets and
  steps from time 0, consistently for every candidate, with core-gate and
  render semantics as the baseline. `mode` and `dt` are required whenever any
  physics constraint is active. `warmupSteps: 0` is supported; any other value
  is refused by name (`COMPARE_WARMUP_UNSUPPORTED`) until warm-up is
  implemented and controlled — never silently treated as zero.
  [implemented, #1230] `warmupSteps` other than 0 is refused before any
  document is read (`MQ41`); `mode: 'none'` on a reference that declares a
  physics constraint is `COMPARE_INPUT_MISSING`.
- [agreed, rig-parts#126] **P11 — parts supplies the schedule and the
  selection membership; rigc invents no split.** Frames are named by
  `FrameRef.id` (animation, phase and time). The report keeps
  selection-only and held-out results apart, and a frame used for candidate
  choice is never held out. A held-out claim requires a nonempty set of
  held-out frames disjoint from `selection`, evaluated through the same
  recorded physics reset and `dt`; `setup` is a shared baseline
  (`role: 'baseline'`) and is not held-out evidence. [implemented, #1230] a
  frame is `selection` exactly when its id is in `selection`, `baseline` when
  it is `setup`, and `held-out` otherwise; a selection id the schedule does not
  walk is refused by name rather than read as held out; each motion row carries
  its reading per role, `heldOut` null with no held-out frame, and the
  schedule's `heldOutClaim` is false then (`MQ42`).
- [agreed, rig-parts#126] **P8 — the reference is the unreduced,
  independently gated source mesh.** It may be generated by the automatic
  pipeline; a reference game's mesh or vertex count is not an input. A
  candidate-to-candidate comparison may be reported as a diagnostic and never
  establishes acceptance. [implemented, #1230] the contract's `MQ11`, printed
  as `MQ56`: two candidates that drop the same art read 0 against each other
  and each fails coverage against its own mask; held to that bound, either one
  as the reference is `COMPARE_REFERENCE_FAILS`.
- [proposal] **Independent evidence.** Agreement between candidates is
  necessary and not sufficient — two candidates that both drop the same art
  agree perfectly. So each candidate, **and the reference**, is held
  separately to: (a) art coverage, overshoot and undercut against its
  attachment's own mask at setup (§4), the reference under `referenceArtFit`
  and each candidate under `candidateArtFit`, both at the final threshold;
  (b) the existing gate on its own build, every assertion as it runs today
  (A13 budgets, A20 weight coherence, A21 rim pinning where it applies, A22 UV
  range, A39 winding); (c) every bound in `bounds`. A reference that fails
  (a) or (b) is refused as a reference (`COMPARE_REFERENCE_FAILS`), because a
  deviation from a wrong reference is not evidence. [implemented, #1230, (a)
  only] each build's art fit at setup is `measureMeshQuality` over its UVs on the
  frame's drawing px — the reading the compiler's authored fit takes
  (`measureAuthoredFit`, `src/compile.ts`) — under `referenceArtFit` or
  `candidateArtFit`, as the build's `geometry` section. [implemented, #1230]
  `COMPARE_REFERENCE_FAILS` (`compareMeshesInMotion`, `src/meshcompare.ts`): a
  reference whose `MQ_COVERAGE`, `MQ_OVERSHOOT` or `MQ_UNDERCUT` fails
  `referenceArtFit` — (a) as written, and nothing else (`REFERENCE_ART_FIT`) —
  is refused before any candidate is measured, naming each failed row with its
  value and bound; a candidate failing the same bound is reported, not refused
  (the contract's `MQ19`, motion half, printed as `MQ59`). Only a **failed**
  row refuses: a reference row that is `not-measurable` — an attachment under
  its sample floor (P9) — leaves its section `not-measured` and the reference
  not accepted, which the report already says, and refusing it would make
  `MQ60`'s floor unreachable at the attachment level. (b), the gate on each build, is
  held where it runs and not a second time: `build` writes
  `skeleton.model.json` only after every assertion passed (*emit only after
  green*), and the module is handed that document's text — not the rig, the
  plates or the Spine pair the gate reads — so it cannot rerun the gate, and
  does not claim to. ⚠️ A document edited after its build is outside (b): the
  install smoke's moved-vertex candidate is exactly such a document, used as a
  planted displacement and never as evidence that a mesh is acceptable.

## 4. The measurements, defined

**Existing.**

- **Coverage**: share of art pixels (alpha `>=` threshold, every island) whose
  centre a triangle covers (`measureAuthoredMeshFit`, `src/mesh.ts`).
- **Overshoot**: the furthest covered pixel outside the **filled** silhouette,
  exact Euclidean distance in pixels, on the `r6` grid
  (the internal `squaredDistanceToSet` in `src/mesh.ts`, read by
  `measureAuthoredMeshFit`). The contour builder's ceiling is
  `margin × 4 + tolerance + 1`, the last term being the one-pixel
  centre-sampling term (`contourOvershootBound`).
- **The hole-filled silhouette** exists in two flavours, both in
  `src/mesh.ts`. The tracer fills background that **no 8-connected** path of
  background reaches from the border (`traceAlphaOutline`'s
  `fillEnclosed(inside, w, h, 8)`; issue #1209, landed by PR #1210 — the
  CHANGELOG's 2.15.1 entry); the authored-mesh fit fills with a
  **4-connected** flood over all art (`measureAuthoredMeshFit`'s
  `fillEnclosed(art, w, h, 4)`, its default; `connectivity: 8` makes it the
  tracer's flood, #1262 — P12 below). `fillEnclosed`'s own comment states the two
  "agree on every mask the trace accepts" — they can differ only across a
  diagonal pinch, which the tracer refuses.
- **Holes and islands in the format.** A Spine mesh's outline is one closed
  loop and its triangle count is Euler's for a hole-free triangulation;
  `traceOutline` refuses a pinched vertex, a hole and two islands by name
  (`src/mesh.ts`, the section headed "the outline a triangulation already
  states"). So a mesh can **span** a hole and can **bridge** islands
  (`buildSegmentsLattice` does, its step "**One loop.**"), and it cannot cut
  either out.
- **Orientation and degeneracy**: generators emit counter-clockwise in Spine
  world (`MeshGeometry.triangles`, `src/mesh.ts` — every one since #1236, held
  by `CT15`); `traceOutline` refuses a
  triangle that "repeats a vertex, so it has no area"; the A39 band (`DEFORM_AREA_EPSILON`,
  `float32AreaNoise`) decides when a sign is not read.
- **Texture stretch**: the singular values of `J = D·P⁻¹` per triangle
  (`stretchSingularValues`, `src/deformsurvey.ts`); a plain triangle with no
  area has no map and is counted `degenerate`, never given the identity.

**Proposed.** [proposal] every definition below, except where a row is marked
agreed.

[implemented, #1230] `MQ_LOCAL_DEFORMATION`, `MQ_STRETCH` / `MQ_SQUASH` and
`MQ_INVERSION` are measured by `compareMeshesInMotion` (`src/meshcompare.ts`),
as *The comparison as implemented* states.

[implemented, #1224] Every geometry row — every row of the table except
`MQ_LOCAL_DEFORMATION`, `MQ_STRETCH` / `MQ_SQUASH` and `MQ_INVERSION`, which
are stage C's — is measured by `measureMeshQuality` (`src/meshquality.ts`) as
defined here, with these readings of what the table leaves open:

- `MQ_UNDERCUT` is `not-measurable` when the triangles cover no pixel centre,
  since no art pixel then has a distance to a covered one. Its worst pixel is
  `MQ_COVERAGE`'s worst too.
- `MQ_BOUNDARY_DEVIATION` is taken against `MeshMeasureInput.referenceHull`
  and is `not-measurable` without one; `MQ_TRACE_DEVIATION` against the
  outline `traceAlphaOutline` traces, which is the **largest** island's. Both
  are exact on the polygons by a branch and bound along each edge, to `1e-9`
  px before the `r6` grid, and name the candidate hull edge the worst value
  belongs to.
- `MQ_HOLES` counts the pixels the triangles cover that the filled silhouette
  holds and the art does not — the transparent pixels a mesh spans.
- `MQ_ISLANDS` counts the 4-connected art islands (the tracer's,
  `labelIslands`) the triangles cover a pixel of, and names the first pixel of
  the second; the bridge area is not a separate figure — it is the covered
  pixels outside the silhouette, which is `MQ_OVERSHOOT`'s domain.
- `MQ_HOLES`, `MQ_ISLANDS`, `MQ_TRACE_DEVIATION` and `MQ_FILL_DISTANCE` take no
  bound, so they are always `undeclared` when measured; `MQ_MIN_ANGLE` is
  gated only when `minAngle` is declared.
- [implemented, #1280] The five allocation rows at the end of the table take
  no bound either, and are `not-measurable`, naming the field, when an input
  they read is missing — §8, *Implemented — the allocation rows*, gives each
  definition, what each needs and the reading of the amplitude.

| Code | Definition | Unit | Raster? |
| --- | --- | --- | --- |
| `MQ_COVERAGE` | `measureAuthoredMeshFit`'s coverage, unchanged | fraction | yes |
| `MQ_OVERSHOOT` | its overshoot, against the filled silhouette as defined in the next bullet | px | yes |
| `MQ_UNDERCUT` | the furthest **uncovered** art pixel from the nearest covered pixel, by the same exact distance transform | px | yes |
| `MQ_BOUNDARY_DEVIATION` | [agreed, P13] symmetric Hausdorff distance between the reduced hull polygon and the **source** hull polygon, exact on the polygons — the required reduction-preservation bound | px | no |
| `MQ_LINE_DEVIATION` | [implemented, #1326] per named line (`object.line`, `object.region` null): the same exact symmetric Hausdorff distance between the line's kept chain and its source polyline — open lines as open polylines — against the line's `maxDeviation`; required; written only when `lines` is declared, in declared order (§11) | px | no |
| `MQ_TRACE_DEVIATION` | [agreed, P13] the same distance against the **traced** silhouette outline — a diagnostic, never required; `not-measurable` with the tracer's refusal as its reason when tracing is refused | px | no |
| `MQ_HOLES` | transparent pixels inside the hull, reported (spanned, drawing nothing) | count | yes |
| `MQ_ISLANDS` | art islands the mesh joins, and the bridge area holding no art | count | yes |
| `MQ_ORIENTATION` | triangles whose signed area in Spine world is negative, outside the A39 band | count | no |
| `MQ_DEGENERATE` | triangles whose \|area\| is inside the A39 band | count | no |
| `MQ_MIN_ANGLE` | smallest interior angle, gated only when `minAngle` is declared | degrees | no |
| `MQ_MAX_EDGE` | [agreed, P15] §5's `L(R)` per region | px | no |
| `MQ_FILL_DISTANCE` | [agreed, P15] §5's `h(R)` per region, sampled — informational, never gated | px | sampled |
| `MQ_LOCAL_DEFORMATION` | per UV sample per scheduled frame, world distance between the candidate's and the reference's carried sample (§3); the worst sample is the row's. A maximum over the **finite** sample set, stated with its domain and count — never a continuous-domain maximum | world | sampled |
| `MQ_STRETCH` / `MQ_SQUASH` | `stretchSingularValues` of each candidate triangle, setup to posed frame; worst max and worst min | ratio | no |
| `MQ_INVERSION` | triangles whose sign changes setup to posed frame, A39's rule; slots in `invariants.deformMayFold` (`src/rig.ts`) not counted and **listed** (§3) | count | no |
| `MQ_TRANSITION` | §5's edge bound across a region's transition band | px | no |
| `MQ_GRADE` | [agreed, rig-parts#126; implemented, #1280] grade max, max \|h_u − h_v\| / L over edges, h the mean incident edge length — always `undeclared` when measured | ratio | no |
| `MQ_MIN_ANGLE_P10` | [agreed, rig-parts#126; implemented, #1280] the tenth percentile of the triangles' smallest angles, nearest rank — always `undeclared` | degrees | no |
| `MQ_ALLOCATION_CONTRAST` | [agreed, rig-parts#126; implemented, #1280] Δ, with economy E beside it; reads `motionAmplitude` — always `undeclared` when measured | fraction | no (the art is read for the silhouette need) |
| `MQ_DEFORM_LOAD` | [agreed, rig-parts#126; implemented, #1280] max L · Δshare · θ / 4 under `motionAmplitude` — a location reading, **not** predicted motion; always `undeclared` when measured | px | no |
| `MQ_BOUNDARY_NECESSARY` | [agreed, rig-parts#126; implemented, #1280] B\*, over `referenceHull` — always `undeclared` when measured | count | no (the art is read for the cut-off test) |

- [agreed, rig-parts#126; implemented, #1224] **P12 — the new measurements use the tracer's
  8-connected background flood**, filled over **all** art (several islands, as
  the authored-mesh fit does). `measureAuthoredMeshFit` keeps its 4-connected
  behaviour unchanged for every existing caller, and no old report is
  reinterpreted. Every new raster row records its connectivity and threshold
  (`MeasureRow.art`); where the 4-connected measurement would differ (a
  diagonal pinch), **both** labelled results are exposed rather than
  harmonised, and a diagonal-pinch refusal keeps its own reason. As
  implemented: `MQ_OVERSHOOT` and `MQ_HOLES` are taken against the
  8-connected fill and, only when the 4-connected fill holds a different set
  of pixels, again against that one as an `undeclared` row with
  `art.connectivity: 4` — the reading `measureAuthoredMeshFit` gives (`MQ04`);
  `MQ_COVERAGE` and `MQ_UNDERCUT` use no fill and record `connectivity: null`,
  `MQ_ISLANDS` records the 4 of its island labelling.
  [implemented, #1262] `measureAuthoredMeshFit` takes an optional fifth
  argument, `connectivity: 4 | 8`, **default 4**, so every call that passes
  four arguments reads what it read before; `8` floods the background through
  the very `fillEnclosed` call the rows read, and anything else is refused by
  name (a `MeshError`). **A consumer's gate that is to agree with these rows
  should read the fit with `8`, or call `measureMeshQuality` directly** —
  with the default it is on the legacy ruler, and the two part exactly where a
  background pocket meets the outside only at a corner. On the recorded
  sources that is rig-parts's `sample/hair_back`: 2 px with the default and
  5.09902 px with `8`, which is `MQ_OVERSHOOT`'s figure for the same source; on
  the other 18 the three readings are one number. `MQ75` holds the default
  equal to an explicit 4 and to the labelled 4-connected row, `8` equal to
  `MQ_OVERSHOOT` by value and by the pixel the overshoot is read at, and all
  three equal on a mask with no such pocket; `MQ76` plants a fit that is
  passed 8 and floods 4, caught on the pocket naming the pixel, and silent
  where the fills agree.
- [implemented, #1224] **Holes are spanned and reported; islands are bridged or
  refused.** A reduction keeps the source's single loop (every step is read
  back through `traceOutline`). Art islands the source does not reach stay
  uncovered and fail `MQ_COVERAGE`; they are never deleted
  (`REDUCE_ISLAND_UNREACHED`, an `invalid-input` termination, when
  `targets.artFit.minCoverage` is 1 and a 4-connected island has no pixel the
  source covers — named by its first pixel and size).
- **Correction 2 — raster sensitivity in the row's unit.** Revision 1 flagged
  a row when `|value − bound| < 1 / pageScale`, which is a distance in drawing
  pixels and means nothing for a coverage fraction or a pixel count.
  [implemented, #1224] Each raster row now carries `RasterSensitivity` (§2): the
  **spatial quantum** of the grid (`1 / pageScale` drawing pixels) and,
  separately, the **value increment** in the row's own unit — `spatialQuantum`
  for px rows, `1 / artSampleCount` for fraction rows, `1` for count rows.
  `nearBound` compares `|value − bound|` with the value increment, and
  equality is its own state (`at-bound`). It is a **diagnostic**: it changes
  no verdict, and neither increment bounds what shifting or resampling a
  whole boundary would do to the value — so it is not an error guarantee and
  the report never calls it one.
- [agreed, rig-parts#126] **P14 — grid metadata plus that correctly typed
  flag is sufficient for the initial contract.** No second-resolution pass is
  mandatory for Stage B. The flag is not a resolution-invariance proof and
  does not close parts#123; optional finer-grid or phase diagnostics may
  follow later with their own declared sampling and mask-resampling policy.
- **Correction 2 — sampled rows.** [implemented, #1224, for `MQ_FILL_DISTANCE`;
  proposal for `MQ_LOCAL_DEFORMATION`] `MQ_LOCAL_DEFORMATION` and
  `MQ_FILL_DISTANCE` compute each carried or measured point geometrically but
  take their maximum over a finite sample set, so each records
  `sampling: { domain, count }` (for local deformation the domain is the art
  pixel centres plus the reference hull UVs, §3), and neither implies a
  maximum over the continuous domain. `MQ_FILL_DISTANCE`'s domain is the art
  pixel centres inside both the region and the hull polygon, each to its
  nearest mesh vertex, and its `art.samples` is that count, held to the
  region's floor.
- [proposal; implemented, #1230] **Transition in time** is phase: a motion row is measured at
  every phase in `schedule.phases`, its value is the worst over them, and a
  row whose verdict differs between phases says so — `MotionRowDetail.byPhase`
  and `phasesDisagree`, which names the worst frame of the passing phase and of
  the failing one (`MQ15`).

## 5. Local refinement — three quantities that are not interchangeable

**Existing.**

- `segments` takes `cell`, a whole number of pixels, and keeps a cell when any
  of its pixels is art (`buildSegmentsLattice`, `src/mesh.ts`).
  Its edges are cell sides (`<= cell`, shorter in the clipped last column and
  row, where `xs` and `ys` are clamped with `Math.min(i * cell, w)`) and one diagonal per cell (`<= cell × √2`). That
  relation holds **only because the lattice is unreduced.**
- `contour` takes a Douglas-Peucker `tolerance` — a deviation, not a spacing —
  and has **no interior vertices** at all (AUTHORING §3.4, `contour`, the
  closing paragraph).
- `grid` takes column and row **positions** (`GridSpecInput`, `src/mesh.ts`).
- Nothing in the tree measures edge length or fill distance.

**Agreed and proposed.** The three, defined numerically over a region `R`
(a closed polygon in part-local drawing pixels, clipped to the source hull):

- **Sampling step `s`** — the spacing of the points a generator *proposes*.
  An input to a generator; not a property of any output mesh.
- **Maximum edge length `L(R)`** — the largest Euclidean length, in drawing
  pixels, of any triangle edge that **intersects the closed region** —
  including an edge that only touches its boundary and an edge whose two
  endpoints both lie outside it — measured whole.
- **Fill distance `h(R)`** — the supremum over points `p` of `R` of the
  distance from `p` to the nearest mesh vertex.

Why none follows from another once a mesh is reduced: removing vertices
merges triangles, so a step `s` bounds neither `L` nor `h` of the result; a
small `h` admits long sliver edges along a boundary, so it does not bound `L`;
and `L` bounds `h` only loosely (`h <= L`, since any point of a triangle is
within the triangle's diameter of every vertex; nothing sharper is claimed).

- [agreed, rig-parts#126] **P15 — the guaranteed quantity is `L(R)`**: exact
  on the emitted triangles, resolution-free and deterministic. It guarantees a
  **geometric density condition, not a numerical deformation-error bound by
  itself** — the motion measurement of §3 stays separate and is the only
  evidence about deformation. `h(R)` is informational (`MQ_FILL_DISTANCE`,
  sampled, never gated) and the generator step is reported. A declared region
  survives even when the test motion leaves it still: the bound is geometric
  and holds with no motion at all.

```ts
/** [agreed, rig-parts#126] P16/P17. */
export interface RefinementRegion {
  /** Caller's name, echoed in the report; rigc reads nothing into it. */
  name: string;
  /** Closed polygon, part-local drawing pixels, y down — resolved by parts (P17). */
  polygon: Array<[number, number]>;
  /** L0: every edge that intersects the closed polygon is at most this long, px. */
  maxEdgeLength: number;
  /** Width of the band outside the polygon over which the bound relaxes, px. Finite, >= 0; 0 is a hard edge. */
  transition: number;
  /** In the band, L(d) = L0 + grade × d, d the distance from the polygon, px per px. Finite, >= 0. */
  grade: number;
  /** P17: when parts approximated another shape by this polygon, how — echoed in `effective`, never read. */
  approximation: { from: string; policy: string; maxError: number } | null;
}
```

- [agreed, rig-parts#126] **P16 — linear grade.** In a region's band,
  `L(d) = L0 + grade·d` for `0 <= d <= transition`, with `grade` and
  `transition` finite and nonnegative. An edge that crosses several regions or
  bands is held to the **smallest** bound applicable anywhere on its
  intersection with them; overlapping regions take the minimum. Outside every
  region and band there is no density constraint — a flat region stays
  economical. Retriangulation of neighbouring triangles that conformity
  requires is allowed, and neighbouring triangles are **not** promised
  byte-identical; wholesale refinement of unrelated areas is not allowed.
  [proposal] The checkable form: every inserted vertex lies inside the union
  of the closed regions and their bands. [implemented, #1224] `reduceMesh`
  inserts only there (`MQ14`, `MQ47`, read by the test's own distance), and
  the form has a consequence the agreement did not state, measured while
  building it: an edge from a vertex inside a region's band to a vertex
  further beyond the band than that edge's bound cannot be brought under its
  bound by any insertion the form allows — every split leaves an edge from
  inside the band to that vertex. So a source whose vertices around a region
  are further apart than `L0 + grade·transition` reaches is not refinable
  under P16 without retriangulating or inserting outside the band; the
  refinement stops there by name rather than spending the budget (*The
  reduction as implemented*).
  [corrected, rig-parts#126 / #1229] That consequence held only because the
  piece from the band to the far vertex stayed held however it was split. With
  the exemption below, a split where the edge leaves the band leaves that
  piece touching the band at one point, so it is no longer held, and the
  stated source is refinable inside the band; the stop now covers only what
  stays infeasible (*Changed since v2.19.0*).
- [agreed, rig-parts#126] **P17 — parts resolves coordinates and names.**
  rigc receives only part-local numeric polygons and offers no bone-relative
  region API — parts already translates rig-space regions to part-local
  coordinates before building a contour mesh (rig-parts `src/rig.ts`,
  `contourAttachment`). A circle or other shape turned into a polygon carries
  its approximation policy and error in `approximation`, which the report
  echoes. Density regions and control-bone influence regions are different
  concepts: a region changes geometry only, and nothing here changes parts's
  existing overlapping-weight-region refusal.
- [proposal] **Refusals for impossible requests**: `REGION_OUTSIDE_ART` (the
  clipped polygon is empty), `REGION_BOUND_BELOW_GRID` (`maxEdgeLength`
  under one texel in drawing pixels), `REGION_SELF_INTERSECTS`
  (`findSelfIntersection`), `REGION_TRANSITION_NEGATIVE`,
  `REGION_GRADE_NEGATIVE`, `REGION_NOT_FINITE`. A satisfiable bound that
  exhausts the budget is not a refusal; it is the `budget-exhausted`
  termination.
  [implemented, #1224] In a reduction the first refused region, in the order
  given, is an `invalid-input` termination carrying the region's code and its
  words; no mesh is returned (`MQ23`, `MQ47`).
  [implemented, #1224] In a measurement each of the six makes that region's
  rows `refused` — §2 defines `refused` with exactly these examples — with the
  reason opening on the code, and the region adds no bound to any other
  region's edges. `REGION_OUTSIDE_ART` fires when the polygon meets no mesh
  edge and no vertex of it lies in the hull polygon: the name says art and the
  definition says the hull, and the definition is what is implemented.
- [implemented, #1224] **`L(R)` and its band, as rows.** `MQ_MAX_EDGE` holds
  every edge that meets the closed polygon, `MQ_TRANSITION` every other edge
  the region holds by `edgeIsHeldByRegion` (below; in 2.19.0, every edge that
  did not meet the polygon and lay within `transition` of it). A region with
  `transition: 0` has no band and no transition row. Each edge's bound is the
  smallest that applies to it anywhere: `L0` of every region it meets, and
  `L0 + grade·d` of every other region that holds it, `d` its distance from
  that region — the nearest point, which is where the graded bound is
  smallest. A row's value is the edge whose
  length most exceeds its own bound, with that edge and that bound, so the row
  fails exactly when an edge it holds is over. A region no edge meets — one
  inside a single triangle — is `not-measurable`, never a pass over no edge.
- [agreed, rig-parts#126] **Which edges a region holds — the exemption.**
  A region's active domain is its closed polygon and, when `transition > 0`,
  the band of that width outside it. An edge is held by the region when it
  meets the domain, **except** when its intersection with the domain is a
  **single point on the band's outer boundary** and the rest of the edge lies
  outside: such an edge is exempt from that region's bound. One definition,
  `edgeIsHeldByRegion(a, b, region)` in `src/meshquality.ts`, is what
  `measureMeshQuality` reads for `MQ_MAX_EDGE` and `MQ_TRANSITION` and what the
  refinement in `src/meshreduce.ts` reads to place a split, so the two cannot
  disagree about an edge.
  - A positive-length intersection is held, including a segment lying along
    the band's outer boundary (`MQ50`), an edge crossing the band or the
    polygon with both ends outside, and an edge with one end on the outer
    boundary that crosses the band (`MQ51`). Two separate touches are two
    points, not one, and are held. Whole-edge measurement and the minimum
    applicable bound are unchanged.
  - Regions are evaluated independently: an exemption from one region never
    removes another region's bound, and the minimum is taken over the regions
    that hold the edge (`MQ52`).
  - `transition: 0`: there is no outer band, and a contact with the authored
    boundary is held under the closed-region rule — never exempt (`MQ53`).
    A later change to that rule needs its own decision.
  - "On the outer boundary" is within `BAND_CONTACT_TOLERANCE`, ten units of
    the `r6` grid, exported beside the predicate: an edge whose nearest
    approach is that close to `transition` and that does not run along the
    boundary is read as touching it. The refinement places its split at half
    that depth inside the band, so the piece it frees is exempt from either
    side of the grid's rounding.
  - [measured, #1229] A consequence of B1's states that the agreement did not name:
    a band whose only nearby edge is exempt holds no edge, so its
    `MQ_TRANSITION` is `not-measurable`, which is not `pass`, and a result
    under it is not accepted. Measured while building `MQ49`, whose fixture
    therefore keeps an edge inside the band.

## 6. UVs, weights, protected features and vertex-indexed deform data

**Existing.**

- A generator's UV is its position over the window on the `r6` grid
  (`src/mesh.ts`); an authored mesh's UVs are the author's.
- Weights: every vertex bound, finite and non-negative, summing to 1 within
  `1e-3` (`src/assertions/bodies/a20.ts`); a weight of 0 is refused on a
  generated mesh under `rig-play`. `segmentShares` keeps the strongest
  `maxBones`, drops shares under `minWeight`, renormalises and closes the last
  at `1 − others` (`src/mesh.ts`); defaults `maxBones` 4,
  `minWeight` 0.03, and a `minWeight` under one grid step `0.000001` is
  refused because "a kept binding could be written as 0"
  (`SEGMENTS_DEFAULTS`, `SEGMENTS_WEIGHT_STEP`, `src/compile.ts`). Bind
  coordinates are each bone's local setup space (`bindWeightedVertices`,
  `src/mesh.ts`).
- `hull` and `edges` are derived from the triangles, never defaulted
  (`src/compile.ts`).
- A `deform` key's `vertices` run is **vertex-indexed** — `fromVertex` counts
  vertices, `offset` indexes the deform array, one pair per vertex unweighted
  and one per influence weighted (AUTHORING §4.11; A35 measures the run). A
  `transform` key is a model evaluated over the attachment's own geometry and
  always covers the whole attachment (`evaluateDeformTransform`,
  `src/deformgen.ts`).
- A linked mesh states no geometry of its own (A44) and by default plays the
  source's deform keys (`timelines`, `src/rig.ts`).

**Agreed and proposed.**

- [agreed, rig-parts#126] **Removal keeps attributes bit-for-bit** (P19:
  "surviving vertices keep their attributes unchanged"). A vertex that
  survives keeps its position, UV and bindings exactly; nothing is resampled.
- [proposal] **Insertion interpolates, then binds.** A vertex the operation
  inserts takes its UV and its weight vector by barycentric interpolation in
  the source triangle containing it, on the `r6` grid; its bind coordinates
  are computed per bone from its setup world position, as
  `bindWeightedVertices` does. Influences are then pruned by the call's
  `InfluenceLimits` and closed at `1 − others`, the `segmentShares` rule. An
  insertion is refused rather than given a bone the source triangle did not
  carry. [implemented, #1224] in `reduceMesh`, with one part **rejected on
  measurement of the types**: bind coordinates are not computed, because
  `SourceMesh.weights` is by bone name without bind coordinates and
  `MeshReductionInput` carries no bone setup transform to compute them from —
  an inserted vertex's weights are by name exactly as a source vertex's are,
  and the compiler binds them as it binds every generated mesh. The containing
  source triangle is the first, by index, whose smallest barycentric coordinate
  is the largest (a point on a shared edge takes the lower-numbered triangle;
  the two agree there). Interpolation can name no bone the triangle's corners
  do not carry, so that refusal has no input that reaches it.
- [agreed, rig-parts#126] **P19 — parts passes explicit influence limits on
  every weighted call.** A preset may supply them only after expansion; rigc's
  `segments` defaults are never inherited, and in particular the ordinary
  `0.03` floor is never applied to interpolated shares — parts deliberately
  keeps smaller positive shares so its ramp stays continuous (rig-parts
  `src/localweights.ts`, `localInfluences`). `minWeight: 0` is admissible on
  the new path: it drops exact-zero entries and keeps every positive one.
  [proposal] "Exact zero" is read **on the 6-decimal weight grid** the
  bindings are written on: a positive share that rounds to 0 there cannot be
  kept as a positive binding (the reason `SEGMENTS_WEIGHT_STEP` exists), so it
  is dropped and **counted** in the report rather than written as a 0 weight.
  If the protected influences of a vertex do not fit under `maxInfluences`,
  the call is refused (`REDUCE_PROTECTED_INFLUENCES_OVER_CAP`, naming the
  vertex, the bones and the cap); they are never removed silently.
  [implemented, #1224] both, in `reduceMesh` on every inserted vertex, in this
  order: protected influences kept first, the strongest others up to
  `maxInfluences` (ties by `boneOrder`), shares under a nonzero `minWeight`
  dropped, shares that are 0 on the 6-decimal grid dropped, the rest closed at
  `1 − others`; the drops are counted in `ReductionChanges.sharesDroppedOnGrid`
  and `sharesPruned` (`MQ43`). A protected share that is 0 on the grid cannot
  be written as a positive binding, and rig-parts#126's acknowledgement
  (comment 6042150608, item 1) asks for a named refusal there: it is
  `REDUCE_PROTECTED_INFLUENCE_BELOW_GRID`, a code B2 adds. Both are
  `invalid-input` terminations. A surviving source vertex is not pruned — it
  keeps its bindings (P19), so a source vertex over the cap stays over it. Weight
  effects still need §3's motion and `MQ_TRANSITION` to be judged.
- **Correction 3 — `weightJump` and protected edges, defined on the result
  rather than on an algorithm.** A Spine mesh has one UV per vertex, so a UV
  seam cannot exist inside one mesh; the discontinuity that can is in
  weights. [proposal] A source edge whose endpoints' weight vectors differ by
  more than `weightJump` (L1, over bones in `boneOrder`) is **protected**, as
  is every edge in `protect.edges`. Whatever the implementation — edge
  collapse, or vertex removal followed by retriangulation of the hole — the
  result must satisfy two checkable conditions: (a) every protected source
  edge is an edge of the result, so both its endpoints survive and no new
  edge crosses it; (b) no edge of the result that is **not** a source edge
  joins two vertices whose weight vectors differ by more than `weightJump`.
  A removal or retriangulation that would break either is not taken. Parts
  tracks the weight discontinuity as its #115. [implemented, #1224] in
  `reduceMesh`: a protected edge's endpoints are never candidates, every step
  is checked to keep every protected edge, and an edge a step adds is checked
  against `weightJump` before the step is measured (`MQ18`). Condition (b) is
  applied to the edges a removal adds; an edge the refinement adds joins an
  inserted vertex whose weights are interpolated between its neighbours'.
- [measured, #1268] **`weightJump` acts through (b) long after (a) has
  stopped protecting anything — read it as a cap on every new edge, not as a
  seam detector.** Condition (a) reads source edges only, so at any value at
  or above the largest source edge jump *J* it protects nothing. Condition (b)
  reads the edges a removal *adds*, and a new edge spans several source edges:
  on a ramp its endpoints differ by several steps, so (b) refuses it at any
  value under that span — up to the largest L1 difference between **any** two
  source vertices, which is 2 whenever two vertices share no bone. Measured at
  exactly *J* on §7's reproducer and on three of rig-parts's recorded
  inputs: (a) protected 0 edges every time; (b) refused 76, 93, 5 and 67
  candidates, and with (b) switched off in a scratch copy the result was the
  run without `weightJump` byte for byte, while with (a) switched off it was
  the run at *J* byte for byte (table in §7, *Measured — `weightJump` at
  exactly J*). So a consumer choosing a value should expect: under *J*, every
  source edge above the value protected and its endpoints never candidates (on
  the reproducer's linear ramp that is every vertex); from *J* up to the
  largest pairwise difference, no protected edge but a reduction held back by
  (b) — fewer vertices removed than without the field, by an amount no source
  edge predicts; at or above that pairwise maximum, exactly the run without
  `weightJump`. The two conditions are unchanged; this is what they already
  said, measured.

```ts
/** [proposal] with P19/P20 folded in. [implemented, #1224] declared in `src/meshquality.ts`, echoed in `effective`, read by `reduceMesh`. */
export interface ProtectedFeatures {
  /** P20: keep every source hull vertex. Required — no default inside the operation; parts's policy default is false. */
  hull: boolean;
  /** Source vertex indices that must survive. */
  vertices: number[];
  /** P20: source edges (pairs of source indices) that must survive as edges. */
  edges: Array<[number, number]>;
  /** Region polygons whose boundary vertices must survive. */
  regionBoundaries: string[];
  /** L1 weight-vector difference above which an edge is protected (correction 3). Null = no such protection, reported. */
  weightJump: number | null;
  /** Bones whose binding may not be pruned from any vertex that carries it (P19). */
  influences: string[];
}

/** [agreed, rig-parts#126] P19: stated on every weighted call, never inherited. */
export interface InfluenceLimits {
  /** The cap on bindings per vertex. */
  maxInfluences: number;
  /** Shares under this are dropped; 0 drops only shares that are zero on the weight grid. */
  minWeight: number;
}
```

- [agreed, rig-parts#126] **P20 — the default automatic policy is
  `hull: false`.** Boundary reduction is the consumer's goal; shape is kept by
  the declared boundary and art bounds (`targets.maxBoundaryDeviation`,
  `targets.artFit`), not by locking every boundary sample. `hull: true` stays
  available as an explicit diagnostic or authoring option, alongside
  individual protected vertices and edges. This is a default of parts's new
  opt-in policy; rigc's operation has no default for it (§1), and no existing
  generator changes.
- [agreed, rig-parts#126] **P18 — the first automatic path reduces only
  parts-generated source meshes, before any authored vertex-indexed deform
  key exists on them.** Imported keyed meshes are not a v1 consumer
  requirement. The generic safeguards stay and are controlled:
  [proposal] a reduction never keeps an old index after **any** topology
  change, including one that only reorders vertices (the canonical output
  order of §1 reorders even on removal). Removal-only on an unweighted mesh
  with `vertices` runs: the run is remapped to surviving indices and the
  removed vertices' offsets are dropped — reported, because the removed
  vertices now move by interpolation, which only §3's comparison can judge.
  Each of the following is refused by name (`REDUCE_DEFORM_INDEXED`, naming
  animation, slot, attachment and key): an inserted vertex under a `vertices`
  run; a weighted mesh whose keyed vertices change their influence layout; a
  source mesh with linked meshes that inherit its keys in a way the remap
  does not support. `transform` keys need no remap — they are re-evaluated
  over the new geometry at compile — and the report lists those
  re-evaluations separately from remaps, since their emitted runs change.
- [implemented, #1224] P18's safeguards, in `reduceMesh`. A `vertices` key
  (`DeformKeyInput`, the emitted `offset` and run) is rewritten entry by entry
  onto the vertex — and, weighted, the influence — it addressed in the result's
  order (`ReducedMesh.deform.remapped`); a removed vertex's entries are dropped
  and listed (`droppedVertices`, also in `ReductionChanges.deformRemapped`); the
  gaps a reorder opens inside the new run are 0, which the format reads outside
  a run anyway (`MQ17`). Refused as `REDUCE_DEFORM_INDEXED`, an
  `unsupported-topology` termination naming animation, slot, attachment and
  key: an insertion whose containing source triangle has a corner a `vertices`
  run covers ("under a run"); a weighted keyed vertex whose binding list is not
  the same bones in the same order in the result — which the canonical order
  causes whenever the source lists them weakest first, since the remap does not
  permute pairs within a vertex; and **any** non-setup key on a linked mesh,
  since a linked mesh's own keys are not remapped here (one that inherits plays
  the source's remapped keys). `transform` keys are listed as re-evaluated
  (`ReducedMesh.deform.reevaluated`). ⚠️ The contract asked for a refusal of
  "linked meshes that inherit its keys in a way the remap does not support";
  B2 reads that as the linked mesh's own keys, the one way the remap carries
  nothing.
- [implemented, #1224] The operation lists every linked mesh of a reduced
  source, because they inherit the new topology (`ReducedMesh.linkedMeshes`,
  `ReductionChanges.linkedMeshes`, echoed from the input's `linkedMeshes`).

## The reduction as implemented (stage B2)

[implemented, #1224] `reduceMesh(input: MeshReductionInput): MeshReductionResult`
in `src/meshreduce.ts`, re-exported through `rig-c/mesh`, returns
`{ mesh: ReducedMesh | null, report }`. `ReducedMesh` is §1's `SourceMesh` in
the canonical order plus `edges` (`meshEdges`), `indexMap` (source index →
result index, `null` where removed), `inserted` (result indices the refinement
added), `linkedMeshes`, `deform` (`remapped`, `reevaluated`) and `counts`. The
contract left the following to the implementation; each is what the tree does.

**Two operations, composed in one order.** Admission (the source against
`sourceBounds`, §1) → refinement → reduction → the result measured once more as
the report's candidate. Each is its own function inside the module, and each
passes with the other idle: `MQ46` runs the reduction with no region, `MQ47`
the refinement with every source vertex protected.

**What a step is held to.** A removal is taken only when, after it, every row
the caller's contract requires is `pass` in `measureMeshQuality`'s reading of
the canonical candidate — art fit at `targets.artFit`, `MQ_BOUNDARY_DEVIATION`
against the source hull at `targets.maxBoundaryDeviation`, `MQ_MIN_ANGLE` when
declared, `MQ_ORIENTATION` and `MQ_DEGENERATE` at 0, and every region's
`MQ_MAX_EDGE` and `MQ_TRANSITION` — so the reduction cannot undo the
refinement. Before the measurement, the conditions no row reads: the hole's
link polygon is strictly simple (`findSelfIntersection`) and ear-clips
(`earClip`), the outline is one loop (`traceOutline`), every protected source
edge is still an edge, and no added edge breaks `weightJump`. A refined source
that does not meet its targets takes no step: the reduction ends at once,
naming the first failing row, and the mesh is returned not accepted. When
several rows fail on one step, the one named is the first of orientation,
degeneracy, boundary deviation, coverage, overshoot, undercut, minimum angle,
maximum edge, transition.

**The candidate order** (determinism, A18). The reduction sweeps the surviving
**source** vertices in ascending source index, one removal attempted per
vertex per pass, skipping protected ones (`protect.hull`, `protect.vertices`,
the endpoints of `protect.edges` and of every `weightJump` edge, and every
source vertex on a `protect.regionBoundaries` polygon's boundary within
`1e-9` px). A step taken stays taken and the sweep continues; a pass that
takes no step ends the reduction as `no-further-valid-reduction`, naming the
constraint that blocked the pass's last attempt, or `protect:` when nothing was
left to try. Inserted vertices are never candidates: they exist to meet `L(R)`.

**The insertion rule.** The refinement measures, takes the first failing
`MQ_MAX_EDGE` or `MQ_TRANSITION` row in report order (code, then region), and
splits that row's worst edge — at its midpoint when the midpoint lies in that
region or its band, otherwise at the point of the edge inside them nearest the
midpoint (among the edge's crossings of the polygon and the feet of the
polygon's vertices, then by halving towards an end that lies inside), every
position on the `r6` grid. [#1229] Before that, when an end of the worst edge
lies outside the region and its band, the edge is split where it leaves the
band — the point of the edge within `transition − BAND_CONTACT_TOLERANCE / 2`
of the polygon nearest that end, on the grid — provided the point is inside
the band, strictly between the ends, and leaves the piece to that end exempt
by `edgeIsHeldByRegion`; each of the three is checked, not assumed. A region
no edge meets gets its polygon's first vertex inserted into the triangle that
holds it. One insertion per
measurement. A band no edge lies in leaves `MQ_TRANSITION` `not-measurable`
(B1's definition), and no insertion is aimed at it.

**Where refinement stops by name** — the consequence of P16 recorded in §5. When
the worst edge has an end outside the region and its band that lies further
beyond the band than the edge's own bound, no insertion inside them can meet
it, and the refinement stops: the reduction is then `no-further-valid-reduction`
with that edge, its end and the distance in the constraint, and the mesh is
returned not accepted. Measured on the public fixtures before the rule
existed: a single quad under a region of `L0` 6 px, band 4 px, grade 0.5 spent
a budget of 1,000 insertions without converging (57 s on one darwin run); the
same request on the 4 × 3 lattice of the suite converges.
[corrected, #1229] Since the exemption, the stop applies only when the split
where the edge leaves the band is not available — always so with
`transition: 0`, whose constraint now says the piece to the far end touches
the authored boundary and stays held (`MQ53`) — and that quad converges
(`MQ48`). No convergence is promised beyond that: protection, a minimum angle,
art bounds, the coordinate grid or the budget can each leave a target unmet,
and the result is then `accepted: false` with the blocking constraint or a
budget termination (`MQ54`).

[implemented, #1311] **The refinement writes no triangle `MQ_DEGENERATE`
refuses.** Before each insertion — the split where an edge leaves the band,
the split nearest the midpoint, and a region's first vertex — the refinement
reads the triangles it would write as the row reads them: over the mesh the
insertion would leave, in the frame's world (`cropToSpineY`), by
`triangleAreas` and `areaBand` (`src/areaband.ts`), each fresh triangle from
all three of its corners since the canonical rotation is not known yet, the
smallest magnitude compared. When one is within the band the insertion is not
made and the refinement stops by name: the target row, the insertion and its
kind, the triangle's three corners each with its distance from the region's
polygon, its area and the band required. The rule it replaces wrote the
insertion and left the row to fail on the refined source — a refined source
over `MQ_DEGENERATE` can take no step, and its termination named a triangle,
or, behind another stop, nothing at all. No bound, tolerance or band moved;
P15, P16 and the convergence clause above stand as they were (a target the
stop leaves unmet is `accepted: false`, never a pass).
[measured, #1311] The cause, on the issue's public input (demo/bottomwear at
the trial's policy, region `density` as an axis-aligned square of half side
45.9609375 px, `L0` 18, band 65, grade 0.2769): the three triangles were
`(216, 468)`, `(216.460932, 467.539068)`, `(216, 467.539068)` and the two
like it at `(252, 468)` and `(288, 468)` — source vertex 450 lies 0.460932 px
inside the band's outer boundary (64.539063 px from the square), two of its
edges leave the band, and steps 109 and 219 split each where it leaves, the
second writing a right triangle of 0.106229 px² against a band of 0.113511
px² (the float32 noise bound of a mesh reaching 690 px; 1e-6 of its largest
triangle is 0.001). The issue's reading — the square's side coincident with
lattice edges at 1/256 px — is refuted: the side lies 64.54 px from that row,
and the same square shifted 1/256 px, turned 1°, 3° or 7° writes 3, 3, 2 and 1
such triangles. The circle (the regular 287-gon) passed on margin, not by
construction: its thinnest triangle reads 0.140 px² against the same 0.1135.
On that instance no other placement exists: every point of the two edges P16
allows lies within 0.460932 px of the vertex, so no pair of splits gives the
triangle more than 0.5 × 0.460932² = 0.106 px² — which is why the rule
refuses and names rather than moving the split. The square now stops at step
219 naming that triangle, `MQ_DEGENERATE` 0 on the returned, unaccepted mesh.
The recorded synthetic "tiny region, coarse source" call was the second
instance: its refinement wrote 26 degenerate triangles (a split nearest the
midpoint landing on the line of an existing edge) while its termination named
a later P16 stop; it now stops at the first, by name. Every other call of §9's
population was unchanged byte for byte (*Stage controls*: `MQ156`–`MQ158`).

**Changed since v2.19.0** ([#1229](https://github.com/rig-c/core/issues/1229),
rig-parts#126 comment 6045645512, option 1). Which edges `MQ_MAX_EDGE` and
`MQ_TRANSITION` hold is the only row semantics that moved; no emitted byte
moves, and no edge that 2.19.0 left free is held now. An edge held in 2.19.0
and exempt now is one that does not meet a region's polygon, whose nearest
approach to it is exactly `transition` (within `BAND_CONTACT_TOLERANCE`), at
one point and not along a side: in 2.19.0 it sat in `MQ_TRANSITION` at
`L0 + grade·transition`, and now it is in no row of that region. `MQ49`'s top
edge is one — `MQ_TRANSITION` holds it at 26 px with a band one and a half
times as wide, and passes it by without one at the band that touches it.
Measured on one darwin run, before (the 2.19.0 tree) and after, each the
second call in one process:

| fixture | 2.19.0 | now |
| --- | --- | --- |
| the coarse quad above, refinement alone | stopped by name after 1 candidate, not accepted | 23 inserted, accepted, 33.6 ms |
| the coarse quad, composed | the same stop | 27 candidates, 23 inserted, accepted, 43.5 ms |
| the 4 × 3 lattice, `dense`, refinement alone (`MQ47`) | 37 inserted, 78.7 ms | 43 inserted, 114.9 ms |
| the 4 × 3 lattice, `dense`, composed (`MQ14`) | 76 candidates, 172.9 ms | 80 candidates, 219.0 ms |
| the 4 × 3 lattice, band 6, grade 2, composed (`MQ14`) | 57 candidates, 93.3 ms | 58 candidates, 107.7 ms |

The lattice spends more insertions because a split where an edge leaves the
band adds a vertex the midpoint rule would not have, and each measurement
now runs the predicate per edge and region.

[measured, #1229] One shape the exemption does not resolve: a region inside a
triangle whose band touches that triangle's own kept edge at one point, with
no edge meeting the region. Each split where an edge leaves the band leaves a
chord from the new vertex to the far corner that crosses the band again, so
the vertices march towards the touching point — which lies on the kept edge,
where no split is aimed because the edge is exempt. On the exact fan with a
diamond under the top edge, each of seven settings tried — `L0` 1 to 4 px,
half-diagonal 1 or 2 px, band 2 or 4 px, grade 0.5 or 1 — spent a budget of
400 candidates; the termination is `budget-exhausted`, by name, as the
agreement allows. `MQ49` keeps its region over a spoke for that reason.

**What was rejected, on measurement of the contract or the brief.**

- [#1229] Exempting any contact with the outer boundary — it would free an
  edge lying along it, a positive-length intersection the agreement keeps
  held; `MQ50` plants exactly that widening and names the edge it frees.
- [#1229] A second copy of the hold rule in `src/meshreduce.ts` — the
  refinement and the rows would then be two definitions that only agree by
  hope; the refinement asks `edgeIsHeldByRegion` whether a split frees the
  piece beyond.

- Bind coordinates for an inserted vertex (§6) — the input has no bone
  transforms, and `SourceMesh` names bones without them; weights stay by name.
- A `deform.refused` list on the result, which the stage-B2 brief named — a
  refused key is an `unsupported-topology` termination with no mesh, so the
  list would always be empty.
- A refusal narrower than "linked meshes that inherit its keys in a way the
  remap does not support" — no input distinguishes the ways, so every
  non-setup key keyed on a linked mesh is refused, and a linked mesh is listed
  by reference only (§6).
- Admission on `sourceBounds` alone — the source's winding (`MQ_ORIENTATION`,
  `MQ_DEGENERATE`) is admitted too, as "its own build gate" in correction 3
  says, since every step is held to both at 0 and a source failing either
  could take no step.

**Cost.** Wall time is never in the report; the suite's last control prints,
per fixture, the candidates tried and the wall time of each `reduceMesh` call.
One darwin run at the commit that added it: the 20-vertex lattice reduced to
its 4 corners in 24 candidates and 97 ms; the refinement alone, 37 insertions
in 274 ms; the composed run, 76 candidates in 295–327 ms; the weighted
refinement, 37 in 451 ms. Every step was then one full measurement over the
plate, so the cost was the measurement's times the steps (since #1246 a step
redoes only what its mesh changed — below); bounding it is stage D's, and these
figures are one machine's reading, not a claim about another.

**The art's rasters, taken once per call**
([#1240](https://github.com/rig-c/core/issues/1240)). What a measurement
reads from the art alone — the art bits at the threshold, the filled
silhouette at both background connectivities and each one's distance
transform, the 4-connected island labels, and the traced outline in drawing
pixels — is an `ArtRasters` value (`artRastersOf`, `src/meshrasters.ts`).
`reduceMesh` makes one per call before admission and hands it to every
measurement the call makes: admission and `checkIslands`, every refinement
and removal step through `measureAgainstTargets`, and the result's own
measurement — each through `measureMeshQualityWith` in `src/meshquality.ts`.
The rule:

- **Passed, never kept.** There is no module-level cache: the object is made
  by the caller, held in the call's `Run`, and dropped with it.
  `measureMeshQuality` makes a fresh one per call, so its behaviour is the
  uncached one, and its signature is unchanged.
- **Computed on first read.** A measurement that returns before a raster row
  (a source that is not one loop) or reads none (art under its sample floor)
  computes nothing more than it did; a tracer refusal is kept as its message
  and read back into the same `not-measurable` row.
- **Refused for any other art.** `checkArtRasters` compares the art the
  rasters were taken from with the input's — the mask's size, the threshold,
  the frame's `pageScale`, `width` and `height`, and the mask array itself, by
  identity — and the first that differs is `REDUCE_ART_RASTERS_MISMATCH`,
  thrown, naming the field, the value the rasters were taken at and the value
  the input requires. No stale raster is ever read.
- **Counted.** `tally` records each quantity's computations and the
  measurements that read the object. `MQ65` holds the cached and uncached
  reports byte-identical on every row over fixtures that read every quantity
  (the pinch reads the 4-connected distance and the tracer's refusal), and
  `reduceMeshWith` — `reduceMesh` over rasters the caller made — to
  `reduceMesh`'s report and mesh bytes; `MQ66` plants rasters at another
  threshold, mask size and mask, each refused by name and never read, and the
  same plant refused by `reduceMeshWith` at admission; `MQ67` reads the tally
  of one reduction — 80 candidates, 84 measurements, every quantity computed
  once — beside the per-step plant computing the art bits 84 times, and holds
  `src/meshreduce.ts` to no call of `measureMeshQuality` and one of
  `artRastersOf`.

`measureMeshQualityWith` and `reduceMeshWith` are on `rig-c/mesh` only
because that entry re-exports both modules with `export *`; a symbol that is
merely exported is not promised (RELEASING.md, *The import surface*), and the
install smoke's observed list is unchanged. `src/meshrasters.ts` is on no named
entry. Rejected: an optional second parameter on `measureMeshQuality`, which
changes the agreed signature; moving the measurement's body into a module
`src/mesh.ts` does not re-export, which moves a thousand lines to keep two
internal names off the entry.

**Cost of the cache, measured.** Rig-parts's `demo/bottomwear` (a 661 × 693
plate, 350,983 art pixels, 536 source vertices, budget 5000), its recorded
`reduceMesh` input replayed on one Apple M4 (darwin 25.6.0, Bun 1.4.2) in the
order before, after, after, before, each in its own process, with another
session's reduction matrix and builds running throughout (1-minute load 5.9,
15.4, 11.0 and 8.0 at the four starts; no stale `rigc-*` directory in
`$TMPDIR`): 1101 candidates every run, `no-further-valid-reduction`, report
and mesh byte-identical. Before, 184.9 s and 138.2 s — 167 and 125 ms a step
((full − budget-0 call) / 1101); after, 76.2 s and 79.4 s — 69 and 72 ms a
step. A CPU profile of a third after-run (55.4 s, load 7.0) puts 98.3 % of
samples still in the measurement and 0.16 % in functions of the art alone
(`artOf`, `fillEnclosed`, `labelIslands`, `traceAlphaOutline`), against
≥ 40.1 % before (#1240's profile): what remains per step is the candidate's
own coverage raster (`rasteriseTriangles`, 45.3 %), its distance transform
(`squaredDistanceToSet`, 22.4 % with the silhouette's no longer in it) and the
two Hausdorff readings (18.0 %). The byte identity is measured over the 18
`reduceMesh` inputs rig-parts made at 2.20.0 (report, mesh and the
admission-shaped measurement: 54 of 54 files identical to the tree before the
change and to the installed 2.20.0's) and over every `measureMeshQuality` and
`reduceMesh` call the `mesh-quality` and `mesh-compare` suites make (152
outputs, the same in order). These figures are one loaded machine's reading,
not a claim about another; no wall-time threshold is set here.

**Each step carried from the last one**
([#1246](https://github.com/rig-c/core/issues/1246)). After the cache, a
step's cost was the candidate's own coverage raster, its distance transform and
the two Hausdorff readings, and almost all of it was redone for nothing: on
`demo/bottomwear` a measurement's triangles differ from the previous
measurement's by 5.1 removed and 4.7 added of ~465 (5.4 % of the rasteriser's
box work), 21 pixel centres flip on average and none in 243 of 1103, the
distance transform's columns and rows that a flip can reach are 7.3 % of its
passes, and the outline is unchanged in 243 of 1103 (interior removals). So
`reduceMesh` measures every refinement and removal step through a
`StepRasters` value (`stepRastersOf`, `src/meshrasters.ts`) with
`measureMeshQualityStep` in `src/meshquality.ts`, made once per call beside
the `ArtRasters` and dropped with it. The rule, one quantity at a time, is that
each carried value is the same function of the same input as the full one:

- **Coverage** is a count per pixel centre of the triangles whose centre test
  holds there — `triangleRasterBox` and `pixelCentreInTriangle` in
  `src/mesh.ts`, the rule `rasteriseTriangles` itself reads. The triangles are
  diffed against the last measurement's as a multiset keyed by their corners'
  exact coordinates in the order given; one taken away is drawn with −1 and one
  added with +1, so a centre is covered exactly when its count is positive —
  `rasteriseTriangles`'s union. Covered art, covered centres, covered pixels
  per island, the uncovered art pixels and the covered centres outside each
  filled silhouette or in its holes are kept with it, updated at each centre
  that flips; a worst pixel is read from those sets by the full scan's rule
  (the largest value, the first pixel in order among equals).
- **The distance transform** is `squaredDistanceToSet`'s two passes, now
  `distancePassesOf` in `src/mesh.ts`, which `squaredDistanceToSet` itself
  calls. A column's pass reads that column of the coverage alone, so only
  columns holding a flipped centre are redone; a row's pass reads that row of
  the column results alone, so only rows where a redone column changed are.
- **The outline rows** (`MQ_BOUNDARY_DEVIATION`, `MQ_TRACE_DEVIATION`) are
  handed back whole when the outline and the polygon it is read against equal
  the last ones coordinate by coordinate. Otherwise `hausdorff` runs as it
  always does, and only its point-to-edge distance lists are carried
  (`carriedDistances`): a list toward the fixed polygon is kept per point, and a
  list toward the outline copies each distance whose edge — both ends,
  exactly — the last outline also had, computing the rest. The branch and
  bound itself is not made incremental: its pruning depends on the best value
  found so far, so a per-edge reuse would change which points are sampled.
- A measurement whose triangles differ from the last in more than they share
  is built from nothing, as the first one is. Which way a reading is built
  changes its cost, never its values.

`measureMeshQuality` and `measureMeshQualityWith` are the full path and are
unchanged; `reduceMeshWith(input, rasters, null)` measures every step in full,
and step rasters made over another rasters object are refused
(`REDUCE_ART_RASTERS_MISMATCH`). `MQ68` measures a sequence — an interior vertex
moved, a hull vertex out and in, a corner cut, a fold, a fan of another
topology and back, and the pinch's 4-connected silhouette — through one
`StepRasters` against a fresh `measureMeshQuality` each, every row's bytes and
every pixel's coverage and squared distance identical, and two reductions
carried, over the step rasters made by the caller and in full, byte-identical;
`MQ69` plants a skipped added triangle, a skipped distance-transform column and
row, an outline reused on its vertex count alone and an edge distance copied
from the wrong edge, each caught by the pixel or the row it changed.

**Cost of carrying, measured.** The 18 `reduceMesh` inputs rig-parts made at
2.20.0, replayed one process per call through the tree before the change and
after it: report, mesh and `accepted` identical, 54 of 54; every
`measureMeshQuality`, `measureMeshQualityWith`, `reduceMesh` and
`reduceMeshWith` output the `mesh-quality` and `mesh-compare` suites make, run
by the selftest from before the change over both trees: 303 outputs, the same in
order. `demo/bottomwear`, before and after in the order before, after, after,
before, twice, on one Intel Core Ultra 7 265K (20 threads, WSL2 Linux 6.6, Bun
1.4.2), 1-minute load 0.80–0.99 at every start and nothing else running: 1101
candidates every run; before 32.1–34.3 s, after 2.98–3.24 s; per step
((full − budget-0 call) / 1101) 29.0–31.0 ms before and 2.5–2.8 ms after. A
CPU profile of a third after-run (4.0 s) puts 32.4 % of samples in the carried
coverage (`StepRasters.coverage`), 32.0 % in the outline readings and 9.8 % in
`canonicalise`; before, 46.1 % was `rasteriseTriangles`, 23.9 %
`squaredDistanceToSet` and 19.5 % `hausdorff`. These figures are one machine's
reading, not a claim about another; no wall-time threshold is set here.

**A region's rows, carried from the last step too**
([#1253](https://github.com/rig-c/core/issues/1253)). After #1246 a step
over a mesh with no region cost about 2.6 ms; with one region it cost about
1.8 s. The subject is rig-parts's `demo/bottomwear` (536 source vertices, a
661 × 693 plate with 350,983 art pixels) with one declared region `hem`: a
circle of radius 65 handed over as a circumscribed 287-gon, `maxEdgeLength`
18, `transition` 65, one art sample — 1443 candidates, 262 inserted and 214
removed. Its profile, split by what a step does (section timers and counters
in an instrumented copy, the call capped at `maxCandidates` 320 for the
profile only: all 263 refinement measurements and the first 58 removal
attempts):

- **`MQ_FILL_DISTANCE`** was 92 % of a refinement measurement (1,634 of
  1,778 ms) and 90 % of a removal one. Every measurement tested all 350,983 art
  pixels against the region's closed polygon (`inClosedPolygon`, 287 sides:
  100.7 million side tests), then the 13,273 inside it against the hull (about 293
  sides: 3.9 million) and each of those against every vertex (8.9 million
  distances at 667 vertices).
- **The region's edge predicates** (`edgeIsHeldByRegion`, `segmentToPolygon`,
  `segmentMeetsPolygon` — every edge against the 287 sides) were 6.5 % and
  1.4 %.
- **`canonicalise`** was 0.6 ms a step and **the carried coverage** 0.6 ms:
  an insertion flipped no pixel centre in any of the 263 refinement
  measurements (splitting a triangle changes which triangle covers a centre,
  never whether one does), and a removal flipped 17 on average, redoing 10.6
  columns and 147 rows of the distance transform.
  `canonicalise` cannot move to the end of the run in any case: the
  refinement reads the canonical order to name the edge it splits, and the
  removal's outline check is what refuses a step that leaves no single loop.
- The self-intersection check of the region's polygon (`findSelfIntersection`)
  was 0.1 % before and, once the rest was carried, the largest of the
  region's terms in a removal step, so it is carried with them.

So `regionRows` (`src/meshquality.ts`) reads each of those through the call's
`StepRasters` (`src/meshrasters.ts`), by the rule #1246 set: each value is
the same function of the same input.

- **The region's art pixels** (`regionPixels`) — the art pixels whose centre
  lies in the closed polygon, ascending — are a function of the art and the
  polygon alone: computed once for a polygon equal coordinate by coordinate,
  and handed back after. The fill scan visits them in ascending order, which
  is the order a scan of every art pixel keeps them in.
- **The polygon's self-intersection check** (`polygonCrossing`) is handed back
  the same way.
- **An edge's answers** (`regionEdges`) — whether it meets the closed polygon,
  and whether the region holds it and at what distance — are functions of its
  two ends and the region's polygon and band, so they are carried from the last
  reading of the region for an edge with both ends equal, in the same order.
- **The fill distances** (`regionFill`). Whether a region pixel lies in the
  hull is measured again only inside the box of the hull edges that changed
  (directed, both ends exact), widened by one unit; outside it the shared
  edges answer the same, a changed edge is further than the boundary tolerance,
  and the changed edges cross a horizontal ray from the pixel an even number of
  times between them, so the parity is the last one's. A pixel's nearest-vertex
  distance is carried by the vertices that differ from the last reading's, as
  a multiset of exact coordinates: while the vertex that attained it remains,
  the new minimum is the smaller of the last one and the distances to the
  vertices added; when it is gone, the pixel is measured over every vertex
  again. A minimum is exact, so either way it is the same number.
- **Admission** is measured through the same `StepRasters` when the call
  carries one, so the region's pixel set is computed once per call rather than
  once for admission and once for the steps.

`measureMeshQuality` and `measureMeshQualityWith` read none of this; their
signatures, every row's definition, the budget, the bounds, the sample counts,
the raster resolution and the candidate order are unchanged. `MQ70` measures a
sequence under a region — an interior vertex moved, a fold, a corner cut that
moves the hull across region pixels with its vertex count unchanged, the region
moved to another polygon of as many vertices, and the region with two corners
swapped — through one `StepRasters` against a fresh `measureMeshQuality` each,
every row's bytes identical, and a reduction under a region carried and in full,
byte-identical; `MQ71` plants a pixel set and a crossing check handed back on
the vertex count alone, an edge's answers carried from an edge sharing only its
first end, a changed hull's box not measured again and a nearest vertex kept
after it was removed, each caught by the row it changed.

**Cost, measured.** The 18 recorded inputs and the with-region one, replayed
one process per call through the tree before and after (the with-region before
side is the profiled run below): report, mesh and `accepted` identical, 57 of 57;
every `measureMeshQuality`, `measureMeshQualityWith`, `reduceMesh` and
`reduceMeshWith` output the `mesh-quality` and `mesh-compare` suites make, run by
the selftest from before the change over both trees: 379 outputs, the same in
order. On one Intel Core Ultra 7 265K (20 threads, WSL2 Linux 6.6, Bun 1.4.2),
each run alone on the machine (the pool held exclusively) and the 1-minute load 0.1–1.1 at every start:
the with-region call before, under the CPU profiler, 2,575 s (1443 candidates;
the profiler's cost is within the noise — the unprofiled first 100 candidates
took 188 and 193 s, 1.9 s a step, against 1.8 s a step profiled); after, 10.1–11.0 s
in three runs, 5.7–6.3 ms a step ((full − budget-0 call) / 1443); capped at 100
candidates, before 188.0 and 192.9 s, after 2.14 and 2.20 s. The no-region call,
before and after in the order before, after, after, before, twice: 2.83–3.29 s
before, 2.81–3.17 s after, 1101 candidates every run — the change does not touch
a call without a region. A CPU profile of a fourth after-run (10.9 s) puts
18.6 % of samples in `regionFill`, 12.9 % in computing the region's pixel set
once, 12.3 % in the carried coverage and 11.5 % in the outline readings; before,
88.3 % was `inClosedPolygon` and 99.8 % `regionRows`. These figures are one
machine's reading, not a claim about another; no wall-time threshold is set here.

**The region's pixel set, by scanline**
([#1263](https://github.com/rig-c/core/issues/1263)). After #1253 the one
thing a region still cost once per call was its pixel set: every art pixel
centre tested against every side of the polygon — for `hem`, 350,983 × 287 ≈
100.7 million side tests. That is the algorithm, not the polygon, so it is
replaced rather than the polygon (a native circle stays out, P17):
`closedPolygonCentres` (`src/meshquality.ts`) collects each row's crossings
and marks each centre once, O(rows × sides + pixels).

The rule it reproduces is `inClosedPolygon`'s, to the bit, and is written
beside that predicate: a centre is in when its `distanceToSegment` to some side
is at most `ON_BOUNDARY` (1e-9 px); otherwise by **even-odd** parity of a ray
towards +x, where a side crosses when exactly one of its ends has a y strictly
greater than the centre's (half-open: a vertex at the centre's height counts
once, a horizontal side never) at
`xc = ((xj − xi)·(py − yi)) / (yj − yi) + xi`, counted when `px < xc`. So
**a centre exactly on an edge or at a vertex is in** — not because the ray
says so, which on a boundary depends on which side is left or right of it,
but because the distance test runs first and decides it; the scanline adds the
same test side by side over the centres near each side. Each row's crossings
are computed by the predicate's own expression in its order, so they are the
same doubles, and a centre's count of crossings strictly to its right is the
predicate's count. The single-point predicate is unchanged and still answers
every single-point question (the hull membership, an edge's endpoints).

`MQ77` holds the scanline equal to the predicate at every centre of twelve
grids — a concave notch, a loop touching itself at one vertex, sides at a
slope of one half through centres, vertices at a row's centre height off the
centres, sides past the grid and an irregular polygon, each at scale 1 and 2:
14,400 centres, 442 on a side and 33 at a vertex. `MQ78` moves every crossing
half a pixel and is caught, naming the first centre that parts. Measured
identity: the 19 recorded inputs replayed through the tree before and after —
report, mesh and `accepted` identical, 57 of 57 — and every region pixel set
the `mesh-quality` and `mesh-compare` suites compute (379), computed both ways
in one instrumented run and identical.

**What a region's polygon costs the caller.** The pixel set is computed once
per call, by scanline. On the machine above (each run alone on it, the
1-minute load 0.6–1.0 at every start), `hem`'s set — 13,273 of the 350,983
art pixels — took 1,372–1,635 ms by the predicate over every pixel and
0.7–3.5 ms by scanline, the same set; the with-region call went from 11.2,
12.0 and 12.2 s to 8.7, 9.5 and 9.1 s, 1443 candidates and the same report,
mesh and `accepted` bytes each run. A CPU profile of a fourth after-run (9.5 s)
no longer shows the pixel set; its largest terms are `regionFill` (21.4 % of
samples), the carried coverage (14.4 %) and the outline readings (13.5 %). So
the sides of a polygon now cost per step only where a step reads them — the
edges it changes (`regionEdges`) and a polygon not seen before — and the
287-gon's once-per-call cost is a few milliseconds; a polygon of fewer sides is
still the caller's choice of approximation, not something the reduction rounds
away. These figures are one machine's reading, not a claim about another; no
wall-time threshold is set here.

**Left for later stages.** The motion comparison and every motion row (§3,
stage C); a finer-grid pass, warm-up and traced-boundary gating (*Stage B
scope*); refinement that retriangulates outside the band or flips edges, which
P16's checkable form as agreed does not admit; remapping a linked mesh's own
keys and permuting a weighted keyed vertex's pairs (§6); a bounded-work claim
(stage D).

### A distance bound declared absent (#1254)

[implemented, #1254] What §1 *A distance bound may be declared absent* agrees,
built: `checkFit` and `measureMeshQuality`'s validation accept `null` on
`maxOvershoot` and `maxUndercut` and refuse `undefined`, NaN and a negative by
name, as before; `compareMeshesInMotion`'s `validateFit` does the same. The
rows take a bound only from a number, so a `null` row is built `undeclared` by
the same path that builds every undeclared row, and a row the art leaves
unmeasurable under a `null` bound is not required either. Neither the carried
step measurement (`StepRasters`) nor any other row reads a bound, so nothing
else moved.

`MQ72` reduces a lattice shifted two pixels off its art — undercut 2 and
overshoot 2 — under `null` distances on both `sourceBounds` and
`targets.artFit`: admitted, 16 vertices removed, accepted, both rows
`undeclared` with their values, effective settings and document echoing
`null`; the same nulls under `minCoverage: 1` are blocked by `MQ_COVERAGE`,
and each distance restored to 0 refuses the source and blocks the target by its
own row, so the `null` is what admitted it; the full, carried and `reduceMesh`
paths agree byte for byte. `MQ73` holds the two misreadings apart from the
reading — `null` as 0 is refused, `null` as a bound nothing reaches leaves a
`pass` row, not an `undeclared` one — and refuses a left-out field, NaN, a
negative and a `null` coverage by name. `MQ74` is the comparison's half: a
reference that fails undercut 0 is admitted under `null` and refused at 0, and
a candidate's row is `undeclared`. Four planted readings of the source —
`null` required at admission and per step, required per step only, read as a
passing bound, read as 0 — each turned `MQ72` and `MQ73` red; `validateFit`
refusing `null` turned `MQ74` red.

**Measured identity.** The 19 recorded `reduceMesh` inputs (the 18 of stage D1
and the with-region one of #1253), each declaring numbers, replayed one process
per call through the tree before and after: report, mesh and `accepted`
identical, 57 of 57.

## The comparison as implemented (stage C1)

[implemented, #1230] `compareMeshesInMotion(input: MotionComparisonInput):
MeshQualityReport` in `src/meshcompare.ts` returns a `mesh-quality-report/1`
with `operation: 'compare'`, written by `writeMeshQualityReport` — no second
format. The contract left the following to the implementation; each is what the
tree does.

[#1595](https://github.com/rig-c/core/issues/1595) adds
`prepareMotionReference(input: MotionReferenceInput)` and
`comparePreparedMotion(handle, input: MotionComparisonInput)` on the same
`rig-c/meshcompare` entry. The first call parses and measures the reference,
plans the schedule, samples the art and poses the reference once. The second
call supplies candidates on that exact reference, schedule, attachments and
options. An opaque handle keeps the prepared data private; a SHA-256 digest of
each bound field, including every mask alpha byte and the sign of numeric zero, refuses changed inputs as
`COMPARE_PREPARED_MISMATCH`. A forged handle is `COMPARE_PREPARED_HANDLE`.
Each returned report is copied so an edited report cannot alter later reads.
The one-shot and prepared paths use the same comparison implementation and
write the same report bytes. The one-shot entry retains its validation and
refusal order; preparing is explicit for callers with several candidates
arriving sequentially. A changed whole or split schedule requires another
handle. Candidate input, candidate art fit and all acceptance rows remain
measured on every comparison.

**The input.** §3's `MotionComparisonInput`, with three fields the agreed text
requires an input for and the interface had no place for: `motionRequired`
(P6), `perFrame` (P7's opt-in) and `schedule: MotionSchedule | null` (P6: no
motion supplied leaves `motion` null, never an empty pass — `MQ10`).
`BuiltCandidate` is `{ id, model }`, the model document's text; see *rejected*
below. All attachments of one call are under one skin: each skin is its own
posed view.

**The report.** `reference` is the reference's own report — its art fit, and
its motion section, in which local deformation is 0 by definition (it is
compared with itself); `candidates` in the caller's order; `sourceCounts` the
reference's counts; `termination` null. `accepted` is P6's: the geometry
verdict `pass` and, with `motionRequired`, the motion verdict `pass`.
`EffectiveSettings` echoes every attachment with its regions' polygons (an
optional field added for this), both art-fit bounds, the motion bounds and the
schedule. Additive types in `src/meshquality.ts`: `MotionRowDetail` (each motion
row's `motion` field — frames measured and not drawn, the reading per phase and
per role, the setup map, uncarried samples, folds, triangles degenerate at
setup), `MotionReading` and `ScheduleWalked`. `perFrame` lists the four
attachment-level rows at every frame walked (`null` where none was taken);
region rows carry their worst frame on the row.

**The schedule.** A rate entry walks `count = round(duration × fps)` intervals,
the render's count (`sampleAnimation`, `src/render_shared.ts`): under `grid`
`count + 1` samples at `sampleTime('grid', …)`, `i / fps` on a whole number of
frames; under `irr` `count` samples at `sampleTime('irr', …)`, each a frame
interval's `IRR_OFFSET` past its grid sample (`src/core/animation.ts`). An
explicit-times entry takes no phase — a phase is a rule for placing samples, and
those times are placed already — so its frames carry `phase: null` and their id
spells `explicit` where a phase would be: `<animation>@explicit@<time>`. Each
(animation, phase) is one walk from the reset at time 0 (`poseRawAnimationEach`,
reset `'animation'`), stepped to its frames in ascending time by
`stepSchedule`'s rule (`src/core/constraints_physics.ts`) — steps of `dt` while
before the next frame, then to it — under `mode: 'step'`, and one jump per frame
under `mode: 'none'`. The steps are computed once and handed to the reference
and every candidate (`MQ22`). Since
[#1389](https://github.com/rig-c/core/issues/1389) the physics clock moves by
`physicsClockStep` of each step, the render's clock (`src/core/raw.ts`, issue
#1380), so a walk time that ends on a whole number of a constraint's steps
takes them as exact arithmetic does rather than as rounding falls: at parts'
12 fps and `dt` 1/12 the step itself happened to resolve every tie right
against 60 Hz and mis-stepped thousands of updates against 30, 24 and 50 Hz,
and at the suite's 4 fps and `dt` 1/60 it mis-stepped against every rate
(`comparisonWalk`; `MQ178` reads each constraint's step count, `MQ179` holds a
rig without physics byte-identical under either clock). A time past the animation's duration, a frame id
given twice and an animation the reference does not have are
`COMPARE_INPUT_MISSING`.

**The rows.** Per attachment, in skeleton order: `MQ_INVERSION`,
`MQ_LOCAL_DEFORMATION` (and one per region), `MQ_SQUASH`, `MQ_STRETCH`.
`MQ_LOCAL_DEFORMATION` is the largest world distance over the samples carried by
both meshes and the frames the attachment is drawn at, bound
`maxLocalDeformation` (required), `sampling.count` every sample of the domain and
`art.samples` the art pixels alone. `MQ_STRETCH` is the largest `σ₁` and
`MQ_SQUASH` the smallest `σ₂` of `stretchSingularValues` (moved unchanged to
`src/areaband.ts`, re-exported from `src/deformsurvey.ts`) from each triangle's
setup world triangle to its posed one, bounds `maxStretch` / `minStretch` when
declared and `undeclared` otherwise. `MQ_INVERSION` is the most triangles
reversed at one frame by A39's rule (`surveyDeformKeys`' reading: the band
over the setup and posed areas, no sign read off a setup triangle inside it, one
collapsed onto zero not reversed), required at 0 except on a
`deformMayFold` slot. A value of 0 on a distance or count row points at nothing
(`worst: { at: {} }`).

**Equality** (correction 5) is `firstDifference` over the parsed documents in
the reference's key order, with arrays of named objects named by `name` in the
path (`bones["b"].x`, `constraints["b_follow"].strength`), each value shown
beside the other. The allowlist is `allowed`'s: the compared attachment's
`uvs`, `triangles`, `vertices`, `hull` and `edges`; its deform keys' runs (every
field but `time` and `curve`) and `deformTransforms` entries (every field but the
key's identity and time); the slot's `meshes` entry (every field but `slot` and
`attachments`), `meshBones`, each physics constraint's `drivesMesh`, and the
slot's `rig.meshKinds`, `rig.meshDeclaredBones` and `rig.meshSoftBones`; `pages`;
`spine.sha256`. `pages` needs no conversion check: the comparison reads each
mesh's region UVs off its own attachment and never a page UV.

**What was rejected, on measurement of the contract or the brief.**

- `BuiltCandidate.build` as three paths (`modelPath`, `skeletonPath`,
  `atlasPath`) — the core poses the model document and reads neither file of
  the Spine pair, and a module under `src/` that opened paths would tie the call
  to a disk layout; it takes the document's text.
- A geometry-only report for the reference — the reference's motion section is
  kept, because its stretch, squash and inversion are its own evidence and its
  zero local deformation is `MQ55`'s statement (`MQ00`'s motion half), not a placeholder.
- Explicit times walked once per phase — they would be the same poses under two
  ids; they carry no phase instead.
- A section builder imported from `src/meshquality.ts` — `sectionOf` there is
  internal, and exporting it would put it on `rig-c/mesh` through that
  entry's `export *`; `src/meshcompare.ts` applies §2's rule in its own
  `sectionOf`.
- The version through `src/cli/shared.ts`'s `readVersion` in place — that module
  loads the whole CLI; the reader moved unchanged to `src/package_meta.ts`, and
  `src/cli/shared.ts` re-exports it.

**Cost.** Wall time is never in the report; `MQ55`'s detail line prints one
comparison's frames, samples and wall time on the suite's fixture. One darwin
run at the commit that added it: 10 frames × 1,034 samples (a 64 × 16 strip,
1,024 art pixels and 10 hull UVs), one candidate, 12.5–39 ms over three runs,
including both builds' posing and setup art fits. That is one machine's reading; bounding the work is
stage D's. From an install (`MQ45`'s line in the smoke, which prints its own
figures on every run): the flag mesh of the smoke's fixture, 26 frames × 1,336
samples (1,310 art pixels of a 56 × 40 plate and 26 hull UVs), one
candidate, 79–292 ms over four comparisons on one darwin machine at the commit
that added it in single-case runs (both builds' posing and setup art fits
included; the first comparison of a process is the slow one), and 0.36–2.9 s
inside the full 18-case battery on the same machine, where installs run around
it. One machine's reading, unpaired, as above.

**Stage C2.** [implemented, #1230] What C1 left:

- The entry: `exports["./meshcompare"]` → `src/meshcompare.ts`, the
  `AGREED_IN_1230` row of `OBSERVED_SYMBOLS` (`compareMeshesInMotion`,
  `uvCarriers`; types `MotionComparisonInput`, `BuiltCandidate`,
  `CompareAttachment` recorded and not held), RELEASING.md *The import
  surface* by agreement, and the `drop-meshcompare-entry` plant.
- The call from the install (`MQ45`): `MESHCOMPARE_PROBE_SOURCE` in
  `scripts/install_smoke.ts`, run after the runtime is taken away, recorded
  under `SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`. It
  compares the flag mesh of the build the smoke just wrote with itself (0 at
  every frame), with the same document with hull vertex 0 moved
  `MESHCOMPARE_MOVED` units (that distance at every frame, at that vertex's
  UV — the fixture's bones carry no scale), and two candidates under one id,
  refused as the `MeshReductionError` `rig-c/mesh` exports; the report has
  to say `operation: 'compare'` and `poser.kind: 'core'` at the installed
  version.
- `COMPARE_REFERENCE_FAILS` — *Independent evidence* above.
- The controls, printed from `MQ56` up — *Stage A controls*.

What C2 rejected, and the reason:

- A candidate for the smoke built a second time by the installed `rigc build`
  with a different contour — the flag rides one bone, so any two
  triangulations of it carry every shared sample to the same point under a
  rigid pose (`MQ57`'s statement) and the plant would read 0, which is the
  self-comparison's reading and not a moved vertex. The moved vertex is an
  edit of the built document, inside the allowlist.
- Refusing a reference whose geometry is `not-measured` as well as `fail` —
  see *Independent evidence*: it makes the attachment floor of `MQ60`
  unreachable.
- Refusing a reference on its whole `geometry` verdict, which was the first
  version — measured wrong on the install smoke's own build: the
  contour-generated flag mesh reads `MQ_ORIENTATION` 24 of its 24 triangles
  under C1's setup art fit, so every reference built by the `contour`
  generator would be refused. Winding is (b)'s, not (a)'s, so the refusal reads
  (a)'s three rows only. C2 recorded the reading itself as open: a
  comparison over a contour-generated build reported `MQ_ORIENTATION` failing
  for the reference and every candidate (the smoke's flag mesh, 24 of 24), so
  none was `accepted`. ✅ **Closed by #1236 — the generator was wrong, not the
  reading.** `geometryOf` in `compareMeshesInMotion` (`src/meshcompare.ts`)
  hands `measureMeshQuality` the model document's triangles over the
  document's UVs times the art frame — part-local drawing pixels, y down, as
  `SourceMesh.points` defines them — and `measureMeshQuality` converts every
  point through `cropToSpineY` before it reads a sign, so it reads in Spine
  world, the frame B1's `MQ05` fixture (`mqMesh`) winds in. Measured on one
  public build per generator, the signed area of every triangle in spine-core's
  setup-pose world (y up) against the same triangles as `MQ_ORIENTATION` reads
  them — skeleton and model triangles identical in every mesh, and the two
  signs equal on every triangle:

  | build | generator | mesh | triangles | Spine world, before #1236 | `geometryOf` points (y down) | `MQ_ORIENTATION` reads (via `cropToSpineY`) |
  | --- | --- | --- | --- | --- | --- | --- |
  | `gallery/flex` | `contour` | `flag_a`, `flag_b`, `flag_c`, `leaf` | 50, 46, 79, 75 | all clockwise | all positive | all clockwise |
  | `fixtures/public.ts` `articulated_probe` | `ring` | `mass_pad`, `collar` | 40, 40 | all clockwise | all positive | all clockwise |
  | `fixtures/public.ts` `articulated_probe` | `ribbon` | `trail` | 14 | all counter-clockwise | all negative | all counter-clockwise |
  | `gallery/look` | `grid` | `head`, `hair_lock_l`, `hair_lock_r`, `ahoge` | 320, 48, 48, 48 | all counter-clockwise | all negative | all counter-clockwise |
  | `fixtures/public.ts` `segments_probe` | `segments` | `cloth` | 100 | all counter-clockwise | all negative | all counter-clockwise |
  | `gallery/squash` | authored | `ball` | 8 | all counter-clockwise | all negative | all counter-clockwise |

  No triangle was degenerate and no mesh mixed signs. The cause was a
  derivation, in two comments (the `earClip` doc and the ring builder): that a
  y flip turns a clockwise-on-screen polygon counter-clockwise in Spine world.
  It changes the sign of the signed area, not the direction the loop turns as
  drawn, because the y-up frame is drawn with y up — so an outline clockwise
  on screen (positive `signedArea` in y-down pixels) ear-clips to triangles
  clockwise in Spine world. `windCounterClockwiseInSpineWorld` (`src/mesh.ts`)
  now swaps each triple's last two corners when the polygon's y-down area is
  positive: the triangle set, the hull walk (`traceOutline`, which starts at
  the lowest vertex towards its smaller neighbour), `checkHullOrder` (either
  direction is the same polygon) and `meshEdges` (unordered edge keys,
  interior edges sorted) are unchanged, and only the order of two indices
  inside each `contour` and `ring` triangle moves. Clipping the mirrored
  outline instead was rejected: the ear tests mirror with it, so it picks the
  same ears and writes the same triples. Reading the sign flipped in
  `geometryOf` was rejected on the table — it would fail every `grid`,
  `segments`, `ribbon` and authored build instead. Measured after: every row
  above counter-clockwise; of the gallery's base only `gallery/flex`'s
  `skeleton.json` moved (`tools/emit_hashes.base.json`), and
  `tools/render_hashes.ts base --check` is CURRENT — no pixel moved, because
  nothing culls. `vertices` deform keys index vertices, not triangles, so no
  animation data changes. Held by `CT15` (`contour-mesh`: every generator's
  triangles counter-clockwise on spine-core's posed world, the plant the
  emitted skeleton with the swap removed, named by generator and triangle),
  `MQ64` (`mesh-compare`: a contour-generated build compared with itself is
  `accepted` with `MQ_ORIENTATION` 0 for both, and its triangles read with the
  sign flipped fail `MQ_ORIENTATION` naming the triangle), and the install
  smoke's `MQ45` step, which now requires the flag mesh's self comparison
  `accepted`.
- An unknown page appended to `pages` for `MQ63`'s allowlisted difference —
  `readModel` refuses a page with fields it does not know before the
  comparison runs; the control doubles each page and moves its regions instead.

## Stage D1 — the installed package over rig-parts's inputs

[measured, #1238] What rig-parts's public inputs show when its automatic
mode runs against the **registry artifacts** `spine-rigc@2.20.0` and `@2.19.0`,
each installed into an empty directory with no spine-core beside it. The
caller is rig-parts at the commit that added the mode (rig-parts PR #131),
unmodified: its `buildRig` with each mesh part of the three public examples
(`demo`, `sample`, `scarf`) switched alone to `auto` under `examplePolicy`
(`fixtures/automesh.ts`, the procedure of `tools/auto_survey.ts`), and its ten
`AUTO_CASES`; every `reduceMesh` call it makes is recorded as made and
replayed one process per call. One darwin machine (Apple M4, 10 cores), Bun
1.4.2, load average 4.3–7.2 throughout — never idle, so no unloaded figure
appears below. Population: 30 parts, of which 18 reach `reduceMesh` (9
example parts, 9 synthetic) and 12 are refused by rig-parts before the call
(`CONTOUR_ONE_ISLAND`). The 18 recorded inputs are byte-identical between the
two versions.

**1. The call shape is on the surface, and 2.20.0 refuses none.** One shape:
all fourteen `MeshReductionInput` fields, no region on any example input,
weights by bone name, `deform` and `linkedMeshes` empty, `preset` null. 18 of
18 calls return at both versions. Every value the automatic mode imports is
held by a row of `OBSERVED_SYMBOLS` (`scripts/install_smoke.ts`) on
`rig-c/mesh`; two types it uses, `SourceMesh` and `RefinementRegion`, are
in no row (types are recorded, not held). rig-parts's other imports go
through `./*.ts` courtesy keys rather than the named entries holding the same
symbols. `compareMeshesInMotion` from the install over rig-parts's own demo
builds (`neck` and `bottomwear`, `idle` at 12 fps, 50 frames): the tracked
build against the automatic one is `accepted`; the tracked build against
itself is **not** — `MQ_ORIENTATION` fails on every triangle (210 of 210, 620
of 620), because rig-parts's lattice and contour emitters write clockwise in
Spine world (all 20 tracked meshes measured on the compiled skeletons through
spine-core's setup pose).

**2. Reproducible from the install.** Every recorded input replayed twice, in
separate processes and directories: report, mesh and a `measureMeshQuality`
of the source byte-identical, 54 of 54 file pairs; the three comparison
reports, 3 of 3. Between 2.19.0 and 2.20.0, 16 of 18 report-and-mesh pairs are
identical; the two that differ are the synthetic cases with a region, as
#1229's changed semantics predicts.

**3. Budget and termination.** Over 54 reduce reports: every termination one
of the four; `candidatesTried <= budget.maxCandidates` in all 54;
`none-met-the-targets` with no mesh, no geometry and nothing accepted, 3 of 3;
no report says minimal. `unsupported-topology` is not reached on these inputs —
rig-parts refuses every multi-island source first. Each accepted
`no-further-valid-reduction` was re-checked from outside the call: every
surviving source vertex removed by the rule in *The reduction as implemented*
(its fan, the link polygon tested with `findSelfIntersection` and clipped with
`earClip`) and measured with the installed `measureMeshQuality` — 841 removals
over 13 stops, none valid, 4 not re-checked because the link held an interior
vertex; the named vertex reads back the named row at the named value in 13 of
13. The same re-check finds 6 valid steps on the result of a budget-1 stop,
its positive control.

**4. Cost — two verdicts.** The case rig-parts observed at 81–141 s (PR #131's
evidence table, `demo / bottomwear`) is a 661 × 693 plate (350,983 art pixels
at alpha ≥ 1), a source of 536 vertices and 777 triangles, budget 5000.

- (a) **The candidate count is bounded by the budget.** 1101 of 5000 in every
  run of either version, ending `no-further-valid-reduction`.
- (b) **The wall time is not short.** 87–184 s over seven runs of the same
  input, same 1101 candidates and byte-identical results, at load 4.8–7.2 —
  where the same processes ran rig-parts's whole tracked rig stage for the
  example in 53–106 ms. One machine's reading at the loads stated; no bound is
  claimed from it.

Where the time goes, derived because the call has no phase hooks: admission is
one measurement (111 ms), refinement nothing (no region), the final
measurement one (144 ms), and each removal step one `measureMeshQuality` of the
whole plate — (full call − a budget-0 call) / 1101 = 129 ms. A CPU profile of
the call puts 98.98 % of its samples in `measureMeshQuality` under
`tryRemoval`, 0.55 % in the step's own geometry, and at least 40.1 % in
functions whose only input is the art (`artOf`, `fillEnclosed`,
`labelIslands`, `traceAlphaOutline`), which do not change between the steps of
one call. Per-step cost follows the plate's pixel count, not the mesh: 13–129 ms
for plates of 40,388–458,073 pixels. Reusing the art-derived rasters across the
steps of a call is its own card, with this section's byte-identity pairs as its
acceptance.

**5. Winding at every hand-off.** Signed area in Spine world, on the 9 example
inputs (the synthetic cases agree):

| hand-off | every triangle |
| --- | --- |
| rig-parts's contour source as `src/contour.ts` builds it | clockwise |
| the same source as handed to `reduceMesh`, after `spineWinding()` swaps two corners | counter-clockwise |
| the mesh `reduceMesh` returns (8 accepted, 1 refused by admission) | counter-clockwise |
| the compiled skeleton of a real `rig-parts build`, posed by spine-core | counter-clockwise |

Identical at 2.19.0 and 2.20.0 in every row: #1236 moved the `contour` and
`ring` generators, and rig-parts hands rigc authored meshes, so the three
builds' `skeleton.json` are byte-identical across versions. With
`spineWinding()` undone, 18 of 18 recorded inputs are refused at admission
(`REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`, `MQ_ORIENTATION` on every triangle). The
source's winding is fixed by rig-parts's own tiling check (a triangle wound
against the outline is refused), not by `earClip`, so the recommendation
recorded on rig-parts#126 is to keep the swap unconditionally; a conditional
would add a branch that check makes unreachable.

**What was rejected.** Rebuilding rig-parts's call by hand from
`autoReductionInput` — the example calls carry weights over rig-parts's
internal segments and bone transforms, so the input was recorded as made
instead. Reading phases off the report — wall time is never in it. Quoting one
wall time — the seven readings and their loads are the claim.

## 7. Motion-valid reduction (#1266)

> **Mechanism 2 is implemented** ([#1268](https://github.com/rig-c/core/issues/1268),
> *Mechanism 2 — implemented* below), and **mechanism 1's measurement half**
> ([#1294](https://github.com/rig-c/core/issues/1294), *Mechanism 1 —
> implemented, the measurement half*): the residual as a row of
> `measureMeshQuality` and the helper that derives an envelope entry — and its
> **reducer half** ([#1295](https://github.com/rig-c/core/issues/1295),
> *Mechanism 1 — implemented, the reducer half*): `targets.skinning`, the
> residual as a step condition of `reduceMesh`, carried per sample.
> Nothing else in this section is. The
> rest is Stage A of
> [#1266](https://github.com/rig-c/core/issues/1266): a public reproducer
> (`MQ79`, `MQ80`, `mesh-compare`), the measurements made on it, and a proposal
> settled with parts (rig-parts#126, comment 6072801422). #1268 adds one
> report key and one optional input; `compareMeshesInMotion`, every row, bound,
> the reduction's order and budget, and the emitted bytes are unchanged. Marks: **Existing** cites the tree by path and symbol;
> **[measured, #1266]** is a figure taken for this section, with the machine
> beside it; **[proposal]** is unsettled until parts answers the questions at
> the end by number.

The gap, as the card states it: `reduceMesh` holds every static bound and
removes every interior vertex; `compareMeshesInMotion` then refuses the result
on `MQ_LOCAL_DEFORMATION`; and `protect.weightJump` at the value tried keeps
motion by keeping every vertex. Ownership stays as the head of this page puts
it — rigc owns geometry and measurement, parts owns policy and candidate
selection, the consumer declares the motion and the bounds.

⚠️ **Correction [measured, #1271].** The first clause holds as an observation
and misleads as a cause. The strict result's 28 vertices, triangulated
otherwise and with no vertex added, moved or removed, pass the same motion row:
0.244563 px when the same reduction runs interior-first and ends on the same
vertex set, 0.245 px for a left-to-right zipper over the strict result's own
28 (§8, *Triangulation decides motion*). So the reproducer's refusal comes from
the long edges the ear-clipping sequence left across `b`'s ramp (longest
118.8 px), not from the absence of interior vertices — and a 28-vertex mesh
passes where this section's best measured candidates kept 30–53.

### Existing

- **`protect.weightJump`** (`ProtectedFeatures`, `src/meshquality.ts`) is an
  L1 distance between two weight vectors over the bones they name
  (`weightJump`, `src/meshreduce.ts`). It acts twice. Condition (a):
  `protectionOf` protects every **source** edge whose endpoints differ by more
  than the value, and both endpoints become protected vertices, never
  candidates. Condition (b): `tryRemoval` refuses a step one of whose **added**
  edges joins vectors further apart than the value, before the step is
  measured. Both read one edge's endpoints and nothing of its length, so on a
  smooth ramp the figure an edge carries is the ramp's slope times the source's
  spacing: a value under that step protects every edge that crosses the ramp.
  At and above it, (a) protects nothing and (b) still refuses a new edge that
  spans more than the value — measured in *`weightJump` at exactly J* below.
- **The candidate loop** (`removeVertices`): surviving source vertices in
  ascending source index, one attempt per vertex per pass; a step taken stays
  taken; a pass that takes none ends `no-further-valid-reduction`. The budget
  is checked **before** each attempt (`run.steps >= input.budget.maxCandidates`),
  so a call with budget *k* stops after exactly *k* attempts in the state they
  left, reported `budget-exhausted` / `best-meeting-every-bound`. Only the last
  state is returned (`ReducedMesh`); no intermediate mesh is kept, and the
  carried step state (`StepRasters`, *Each step carried from the last one*) is
  dropped with the call. Since #1268 any earlier state is reachable by replay
  (*Mechanism 2 — implemented*).
- **No pose anywhere in the reduction.** `src/meshreduce.ts` links no poser
  (`CUR07` derives the linkers; `MQ26` holds which modules name the
  operations), and `rig-c/mesh` stays geometry-only (§0, P1). `SourceMesh`
  carries weights by bone name and no bone transform (§6, *Insertion
  interpolates, then binds*).
- **`FrameRef.role`** (`src/meshquality.ts`): `selection` exactly when the id
  is in `schedule.selection`, `baseline` for `setup`, `held-out` otherwise;
  each motion row keeps its reading per role (`MotionRowDetail.byRole`) and the
  schedule says `heldOutClaim: false` when no held-out frame exists (P11,
  `MQ42`).
- **The comparison** (`compareMeshesInMotion`, `src/meshcompare.ts`) walks one
  schedule once and poses any number of candidates against one reference;
  carriers are `uvCarriers` over the §3 sample set.

### The fixture

`mvSource` and `mvBuild` in `selftest.ts` (beside the `mesh-compare` suite):
a lens-shaped strip 160 × 48 px whose silhouette bulges 8 px at its middle, a
grid every 8 px (52 boundary and 95 interior vertices, 240 triangles, 280
bindings), the art exactly the pixels whose centre the source hull holds
(6,828 art pixels). Bone `a` at the strip's left end, bone `b` at its middle;
`b`'s share rises linearly from 0 at the left end to 1 at the right across the
whole strip, so the largest source edge jump is 0.1. One animation, `idle`:
`b` alone turns 0 → +5° → −5° → 0 over 2 s. The strict policy is the card's:
coverage 1, overshoot ≤ 3, undercut 0, boundary deviation ≤ 1, influences
`{ maxInfluences: 4, minWeight: 0 }`, no region, budget 5000. The comparison:
`setup` plus `idle` at 12 fps, `grid` and `irr` (50 frames), physics `none`,
6,880 samples (the art pixels and 52 hull UVs), bound 1.

Variants used by the measurements only (scratch, not in the tree), each one
change to that fixture: **kinked** — `b`'s share ramps over x 48..112 only,
flat outside; **smooth** — a smoothstep ramp over the whole strip;
**far pivot** — bone `b` 400 px off the strip's line; **scale** — `b` also
scales (1.15, 0.85) at the +5° key and (0.85, 1.15) at the −5° key;
**diagonal** — the share rises with x + y.

### Measured — the reproducer [measured, #1266]

Printed by `MQ79` and `MQ80` on every run; the figures below are one darwin
run (Apple M4, 10 cores, darwin 25.6.0, Bun 1.4.2, 1-minute load 2.5–4.0
throughout, other sessions running). The motion row is
`MQ_LOCAL_DEFORMATION`, world units (the fixture's bones carry no scale, so
one drawing px is one unit).

| candidate | boundary/interior | triangles | bindings | termination | static | motion, worst frame |
| --- | --- | --- | --- | --- | --- | --- |
| source (reference) | 52/95 | 240 | 280 | — | pass | 0 |
| strict | 28/0 | 26 | 52 | `no-further-valid-reduction` after 175 | accepted | **1.807703 at `idle@grid@1.5` — refused** |
| `weightJump` 0.15 (1.5 × the largest source edge jump) | 42/0 | 40 | 80 | `no-further-valid-reduction` | accepted | 0.058835 at `idle@grid@0.5` |
| the strict order cut at 87 candidates (half of 175) | 28/60 | 146 | 172 | `budget-exhausted`, best-meeting-every-bound | accepted | 0.218939 at `idle@grid@0.5` |

The last two are the card's feasible control: fewer vertices than the source,
every static bound the strict run holds, motion within 1 px. Neither was
chosen by posing — the jump and the cut are derived from the source and from
the strict run — so every frame is held out. ⚠️ Those two derivation rules
were written after the scratch measurements below, so their held-out reading is
a demonstration that such candidates exist, not evidence about a selection
procedure.

`MQ80`, four outcomes on the same fixture:

| outcome | what was run | result |
| --- | --- | --- |
| rigid motion | every vertex wholly on `b` | 28/0, motion 0.000034 — the reduction to the hull passes |
| no reduction | every source vertex in `protect.vertices` | 0 removed, `no-further-valid-reduction` naming `protect:`, motion 0 — identity, not optimisation |
| budget exhaustion | budget 3 | `budget-exhausted` after 3, 1 removed, motion 0.036628 |
| a bound no prefix meets | bound 0.001 | the first prefix that removes anything (budget 2) reads 0.036628 — **fail**, so of the prefixes only the source meets it |

**Correction to the brief.** The brief asked for bound 0.001 as *genuinely
unachievable — nothing but the source passes*. On this fixture that is false:
of the 147 source vertices, 123 can be removed alone with every static bound
held, and **33** of those removals read ≤ 0.001 (4 on the end columns, 29
inside). `MQ80` holds one of them: the midpoint of column 1, removed alone,
reads 0 — its share is its column neighbours' and its position their midpoint,
so the field along that column is linear and the column's edge that spans the
hole carries it exactly. So
*unachievable* is a property of a **search**, not of a mesh and a bound, and
the outcome a motion-aware reduction reports has to say which search found
nothing. On the **diagonal** variant, where the share also climbs with y, no
single removal reads ≤ 0.001 (smallest 0.011931 over the 123); that is the
strongest statement measured, and it is about single removals only.

### Measured — M1, `weightJump` [measured, #1266]

The strict policy plus `protect.weightJump` at each value, on the fixture
(load 2.9–3.7):

| `weightJump` | removed | boundary/interior | triangles | candidates | motion, worst frame |
| --- | --- | --- | --- | --- | --- |
| 0.05, 0.07, 0.09 | 0 | 52/95 | 240 | 0 — `protect:` | 0 (identity) |
| 0.11, 0.15 | 105 | 42/0 | 40 | 189 | 0.058835 `idle@grid@0.5` |
| 0.2 | 105 | 30/12 | 52 | 278 | 0.093172 `idle@grid@1.5` |
| 0.25 | 108 | 30/9 | 46 | 269 | 0.093172 |
| 0.3 | 110 | 30/7 | 42 | 223 | 0.142998 |
| 0.4 | 116 | 28/3 | 32 | 210 | 0.219972 |
| 0.5 | 117 | 28/2 | 30 | 177 | 0.289909 |
| 0.7 | 117 | 28/2 | 30 | 177 | 0.544040 |
| 1.0 | 117 | 28/2 | 30 | 177 | 0.990322 |
| none (strict) | 119 | 28/0 | 26 | 175 | **1.807703 — fail** |

Every value from 0.11 to 1.0 gives a reduced, statically accepted,
motion-valid candidate here — so on this fixture the existing control **does**
answer the card, which the consumer's single value did not show. Every value
at or under the largest source edge jump (0.1) protects every edge that crosses
the ramp and removes nothing: the shape of the consumer's
`removedVertices 0`. Whether that is what happened on the private inputs is
parts's to measure (Q7). On the variants: **smooth** reduces at every value
(19 removed at 0.05, 117 at 1.0) and passes at every value (0.013537 to
0.752818); **kinked** and both **far pivot** variants pass at every value; the
**scale** variant on the linear ramp fails at 1.0 (1.500525) and passes below
it. So no value is safe without a motion
comparison, and a value chosen by one is chosen on **selection** frames.

⚠️ **Correction [measured, #1268].** "At or under" is wrong at the boundary:
the values measured were 0.09 and 0.11, never 0.1 itself. At exactly 0.1 — the
fixture's *J*, nothing strictly above it — no edge is protected and the result
is the 0.11 row's mesh byte for byte (105 removed, 42/0, 189 candidates, motion
0.058835). The sentence holds for values **under** *J*.

### Measured — `weightJump` at exactly J [measured, #1268]

rig-parts reported (rig-parts#126, comment 6072801422, observation (a))
that at `weightJump` = *J* — the largest source edge jump, so condition (a)
protects nothing — the result still differs from the run without the field.
Measured with a scratch copy of `src/meshreduce.ts` that counts, per
candidate, which condition refused it and can switch either off (its
unswitched results byte-identical to `reduceMesh`'s on every call below), on
the reproducer and on the three parts inputs parts named, from the inputs
recorded for stage D1 (rig-c 2.20.0, strict policy, no `weightJump` of their
own). *J* derived as `MQ79` derives it. darwin, Apple M4, load 2.5–2.9.

| input | *J* | `weightJump` | (a) edges protected | refused by (a) | refused by (b) | removed | candidates | mesh |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reproducer | 0.1 | unset | — | — | — | 119 | 175 | A |
| | | *J* | 0 | 0 | 76 | 105 | 189 | B |
| | | *J*, (b) off | 0 | 0 | — | 119 | 175 | = A |
| | | *J*, (a) off | — | — | 76 | 105 | 189 | = B |
| | | 1.1 *J* | 0 | 0 | 76 | 105 | 189 | = B |
| demo/bottomwear | 1.426772 | unset | — | — | — | 254 | 1101 | A |
| | | *J* | 0 | 0 | 93 | 239 | 1457 | B |
| | | *J*, (b) off / (a) off | | | | | | = A / = B |
| | | 1.1 *J* | 0 | 0 | 79 | 240 | 1446 | C |
| sample/sleeves | 1.445506 | unset | — | — | — | 41 | 421 | A |
| | | *J* | 0 | 0 | 5 | 39 | 423 | B |
| | | *J*, (b) off / (a) off | | | | | | = A / = B |
| | | 1.1 *J* | 0 | 0 | 5 | 39 | 423 | = B |
| sample/bottomwear | 1.56238 | unset | — | — | — | 129 | 331 | A |
| | | *J* | 0 | 0 | 67 | 118 | 583 | B |
| | | *J*, (b) off / (a) off | | | | | | = A / = B |
| | | 1.1 *J* | 0 | 0 | 25 | 126 | 454 | C |

At 1.1 *J* the same held: (b) off gave the unset mesh and (a) off the 1.1 *J*
mesh, on all four. The removed counts at *J* (239, 39, 118) are the ones parts
reported, so the recorded inputs are the calls parts measured. **Condition (b)
is the whole of the difference, and (a) none of it.** It stops when the value
reaches the largest L1 difference between any two source vertices: 2.0 on
both bottomwears, 1.989220 on sleeves, and `weightJump` set to exactly that
returned the unset mesh on all three (on demo/bottomwear and
sample/bottomwear, 0.95 of it still did not). That is the `> 2` parts read
off its own 1.5 *J* row. §6 carries the consumer's reading.

### Measured — M2, the weight-field proxy, and what the motion error is made of [measured, #1266]

**The card's proxy**, built in scratch: at every sample of the §3 set, each
mesh's weight vector barycentric-interpolated in its carrying triangle
(`uvCarriers`), and the difference between the source's and the candidate's in
L1 and L∞ over bones, the largest over samples. Over the 119 accepted steps of
each strict run:

| variant | proxy L∞, strict result | motion, strict result | Spearman, proxy vs motion over the steps | does a proxy threshold separate pass from fail at 1 px? |
| --- | --- | --- | --- | --- |
| fixture (linear) | **0** | 1.807703 | undefined — the proxy is 0 at every step | no |
| far pivot (linear) | 0 | 1.807707 | undefined | no |
| scale (linear) | 0 | 2.507863 | undefined | no |
| kinked | 0.352311 | 2.436222 | 0.944 | yes (passing ≤ 0.097509 < failing ≥ 0.104477) |
| smooth | 0.089830 | 2.085513 | 0.805 | no (0.020663 on both sides) |
| smooth, far pivot | 0.089830 | 4.104883 | 0.926 | no |
| smooth, scale | 0.089830 | 3.126620 | 0.681 | no |

L1 is twice L∞ on every row (two bones), so the two orders agree. Across the
M1 candidates of **smooth** the same proxy value 0.020663 sits under motion
0.138059 to 0.752818. And the proxy cannot see a pivot or a scale at all: the
far pivot doubles the smooth strict result's motion and the scale raises it by
half, at the same proxy.

**Why it is blind on the fixture — derived, then measured.** For a mesh whose
vertex *i* has setup position *xᵢ* and weights *wᵢₖ*, posed by bone maps
*Dₖ(p) = Aₖ p + tₖ*, a point at barycentric *βᵢ* in its triangle is drawn at
*Σᵢ βᵢ Σₖ wᵢₖ Dₖ xᵢ*. Write *w̄ₖ = Σᵢ βᵢ wᵢₖ* and *p = Σᵢ βᵢ xᵢ*. The
translations cancel, and, because the shares and the barycentric coordinates
each sum to 1, for any reference bone 0:

  drawn − *Σₖ w̄ₖ Dₖ p* = *Σₖ (Aₖ − A₀) sₖ*, with *sₖ = Σᵢ βᵢ (wᵢₖ − w̄ₖ)(xᵢ − p)*;

so the candidate's drawn point minus the source's, at one UV, is

  *Σₖ (Aₖ − A₀)(sₖᶜ − sₖʳ)* + *Σₖ (w̄ₖᶜ − w̄ₖʳ)(Dₖ − D₀) p*.

The second term is the card's weight-interpolation error times each bone's
motion at the point — it carries the pivot's lever. The first is a product of
weight spread and position spread inside the carrying triangle, times the
bones' **linear** deformation only; a weight-field comparison cannot see it,
and on a linear ramp it is the whole error. Evaluated at the two extreme key
poses, this expression reproduced `compareMeshesInMotion`'s
`MQ_LOCAL_DEFORMATION` to within 2·10⁻⁵ px at every one of the 7 × 119 accepted
steps measured (the variants above). That is a two-bone measurement; the
derivation does not depend on the number of bones, and nothing with three was
measured.

**The bound it gives.** With a declared envelope — per bone, an upper bound
*εₖ* on the spectral norm of *Aₖ − A₀* over the motion, and a lever
*|(Dₖ − D₀) p| ≤ εₖ |p − cₖ| + τₖ* about a declared pivot *cₖ* — the drawn
difference is at most *Σₖ εₖ |sₖᶜ − sₖʳ| + Σₖ |w̄ₖᶜ − w̄ₖʳ| (εₖ |p − cₖ| + τₖ)*,
pose-free and frame-free. Measured over the same 833 steps: never below the
measured motion; measured / bound 1.0 on the fixture and its far-pivot variant
(a pure rotation makes *Aₖ − A₀* a scaled rotation, so the norm loses
nothing), 0.65–1.0 on kinked and smooth, 0.46–0.96 on smooth with the far
pivot, 0.27–0.72 on both scale variants (the norm forgets direction). As a **step condition** in a scratch copy of
`reduceMesh` (residual ≤ 1 px checked after the art rows), the strict policy
reached 28/2 or 28/3 on six variants, every one within 1 px in motion
(0.529452 to 0.990322) — but the kinked result reversed one triangle
(`MQ_INVERSION` 1): the bound is about positions and certifies no orientation,
stretch or squash.

### Measured — M3, intermediate candidates [measured, #1266]

From a scratch copy of `src/meshreduce.ts` that records the canonical mesh of
every accepted removal (the copy's final mesh and report byte-identical to
`reduceMesh`'s): the strict run takes 119 removals in 175 candidates.

- **Prefix replay already exists.** `reduceMesh` with
  `budget.maxCandidates` set to the attempt at which the *j*-th removal was
  taken returned that removal's mesh — points, triangles and weights byte for
  byte — for **119 of 119** steps. Every checkpoint is therefore reachable
  today by re-running the call, holding nothing.
- **Memory of keeping meshes instead** (JSON of `SourceMesh`): the source
  13,691 bytes; every accepted step 962,633; every 4th 237,026; every 8th
  115,695; every 16th 56,297. The attempt numbers alone are 119 integers.
- **Is motion validity monotone along the order?** At a bound of 1 px, yes on
  all seven variants: no step passes after the first that fails (the last
  passing step: fixture 94 of 119, 28/25; kinked 69, 28/50; smooth 84,
  28/35). The **value** is not monotone — it falls at up to 3 steps of a run,
  by up to 0.143173 px — so at other bounds validity is not monotone either:
  the bounds at which a later step passes after an earlier one fails are
  [0.590995, 0.650925) on smooth/far pivot, [0.275883, 0.275897) and
  [2.507863, 2.749208) on linear/scale, [0.408403, 0.408417) and
  [3.126620, 3.273464) on smooth/scale, and only a sliver above the strict
  result's own value on the rest. A search that assumes monotonicity finds *a*
  passing prefix, not necessarily the last.
- **A bisection over the budget**, selecting on the 25 `grid` frames: 8 calls
  of each operation, 764 ms, budget 122 → 28/25, 76 triangles, 0.990322 on
  selection; evaluated with those frames declared `selection` and the 24 `irr`
  frames held out: 0.927313 at `idle@irr@1.531831`, pass, `heldOutClaim`
  true. On smooth, 9 calls, 829 ms, budget 112 → 28/35, held out 0.886173.

### Measured — M4, cost [measured, #1266]

On the fixture, same machine, five repetitions unless stated, load 2.5–4.0:

| what | wall time |
| --- | --- |
| `reduceMesh`, strict, 175 candidates | 59–68 ms |
| `reduceMesh`, budget 0 (admission and the result's measurement) | 2.6–3.7 ms |
| `compareMeshesInMotion`, one candidate, 50 frames × 6,880 samples | 42–46 ms |
| the same, ten candidates in one call | 215–242 ms (about 19 ms a candidate past the first) |
| a motion check at every accepted step: 119 candidates in one call | 2,669–2,700 ms (2 runs) |
| the same, one call per step | 5,343–5,370 ms (2 runs) |
| every 8th accepted step, one call | 333–334 ms (2 runs) |
| compiling one candidate (`compile` + `modelDocument`) | 0.9–2.5 ms |
| the residual as a step condition, recomputed in full at every step (scratch) | 861–910 ms (one run per variant) |

A motion check per accepted step costs about 40 times the reduction; per 8th
step about 5 times; a bisection about 12 times. The full-recompute residual is
about 15 times the reduction — the card's warning about full invariant work on
every step applies to it as written.

### Mechanism 2 — implemented [implemented, #1268]

Agreed with parts (rig-parts#126, comment 6072801422): Q1 — the list and the
replay promise are enough, parts keeps no intermediate mesh and asks for no
step or byte limit beyond `budget.maxCandidates`; Q2 — a replay is its own
input with its own termination, accepted by parts on the same footing as
`no-further-valid-reduction` and `budget-exhausted` / `best-meeting-every-bound`
provided every declared row passes; Q9 — when parts picks a replay by
comparison, it chooses on the `grid` frames and holds out the `irr` frames of
the same animation, and its held-out claim names them as untouched by the
choice (`heldOutClaim: true`, phases listed; another animation only when the
rig declares one; no held-out set is not something parts reports as a pass). The choosing is parts's
(mechanism 3, Q8); rigc supplies the list and the replay.

```ts
/** src/meshquality.ts — additive. */
export interface ReductionChanges {
  // …every existing field…
  /** `candidatesTried` as it stood when each accepted step was taken, 1-based, ascending. */
  acceptedAt: number[];
}
export interface MeshReductionInput {
  // …every existing field…
  /** Stop after the n-th accepted step. Left out = today. A whole number, 0 or more. */
  stopAfterAccepted?: number;
}
// Termination gains one reason, and the run's own two may carry a stop they did not reach:
//   | { reason: 'replayed-to-accepted-step'; acceptedSteps: number; candidatesTried: number }
//   no-further-valid-reduction / budget-exhausted: stopAfterAccepted?: { requested: number; acceptedSteps: number }
```

- **`acceptedAt`** lists every accepted step — each refinement insertion and
  each removal taken — so its length is `insertedVertices + removedVertices`,
  written last in `changes` (the only key a reader of the earlier report meets
  that it did not know). ⚠️ **Changed by [implemented, #1279]:** each entry is
  now an `AcceptedOperation` (§2) rather than the bare attempt number, and a
  boundary run (§8) is one entry that removes two or more vertices, so the
  length is that sum only on a call without `boundaryRuns`. The promise below
  reads "operation" for "step"; the attempt number is the entry's `step`.
- **The contract:** `stopAfterAccepted: n` returns, byte for byte, the mesh the
  same call without the field held after its *n*-th accepted step, terminated
  `replayed-to-accepted-step` with `acceptedSteps: n` and `candidatesTried:
  acceptedAt[n − 1]`, and its own `acceptedAt` is the full run's first *n*. The
  stop is read straight after the step, before the budget is read again, so a
  replay is never reported as an exhausted budget. `n = 0` takes no step and
  returns the canonical source (with a region declared, the unrefined one).
- **A stop the run does not reach** leaves the run to end as it would have,
  with its own termination, which then carries `stopAfterAccepted: {
  requested, acceptedSteps }`; the input is echoed as
  `effective.stopAfterAccepted`. A refusal (`invalid-input`,
  `unsupported-topology`) does not carry it — the refusal is the answer.
- **Inside a refinement** a replay returns the partly refined mesh and its own
  measurement, which may not be accepted: a refinement step is not required to
  meet the targets, only the steps after it are. A removal step is taken only
  when every required row passes after it, so a replay to one carries that.
- **Refused:** a `stopAfterAccepted` that is not a whole number 0 or more, as
  `REDUCE_INPUT_MISSING` naming the field.
- **Measured** [measured, #1268]: on the reproducer, `stopAfterAccepted: k`
  equals the budget cut at `acceptedAt[k − 1]` for **119 of 119** k, termination
  named each time. On the 19 inputs recorded for stage D1, main (5db8e45)
  against this tree without the field: mesh, `accepted` and the report with
  `changes.acceptedAt` removed identical, **57 of 57**; replays at the first,
  middle and last accepted step equal main's budget cut wherever that cut
  returns a mesh (a budget spent inside a refinement returns none, which is
  why the replay, not the budget, is the contract). Cost: a replay to step *k*
  costs its first `acceptedAt[k − 1]` attempts — on the reproducer 4.1 s for
  all 119, against 0.12 s for the run itself, so a consumer searching the steps
  should bisect (§7 M3: 8 replays) rather than walk them.
- **Controls:** `MQ81` (replay identity at a derived sample of 20 of the
  reproducer's 119 steps — the cost above is quadratic in a walk — and across a
  refinement), `MQ82` (the termination, `n = 0`, `n` beyond the run, a budget
  the stop outlives, the report without the field), `MQ83` (a replay planted to
  stop one step early or late is caught naming the step), `MQ84` (refusals).

### Mechanism 1 — implemented, the measurement half [implemented, #1294]

[#1294](https://github.com/rig-c/core/issues/1294) lands the residual as a
**measurement** and the helper that turns declared ranges into an envelope
entry. Using it as a step condition of `reduceMesh` — the veto, carried
per-step state, replay under it — is
[#1295](https://github.com/rig-c/core/issues/1295): `reduceMesh` neither
reads nor echoes anything below, and its loop is unchanged. The proposal
further down is kept as written; this subsection departs from it in the places
it names, each with its reason.

```ts
/** src/meshskinning.ts — on rig-c/mesh through src/mesh.ts's `export *`. */
export interface SkinningEnvelope {
  reference: string;                  // D0: the slot's bone (Q4). Its own terms are 0, so it may not be listed in `bones`.
  bones: SkinningEnvelopeBone[];      // every bone either mesh binds, other than `reference`, once each
}
export interface SkinningEnvelopeBone {
  bone: string;
  linear: number;                     // εk ≥ ‖Ak − A0‖₂ over the motion; dimensionless, finite, 0 or more
  pivot: [number, number];            // ck, drawing px, y down
  translation: number;                // τk, drawing px, 0 or more: |(Dk − D0) q| ≤ εk·|q − ck| + τk
}
export interface SkinningResidualInput {
  source: { id: string; mesh: SourceMesh };  // the original supplied mesh — never a previous candidate
  envelope: SkinningEnvelope;
  maxResidual: number | null;         // drawing px, inclusive; null = declared absent (measured, undeclared)
  deform: DeformTimelineInput[];      // every deform timeline on the attachment or its linked meshes; [] when none
}
/** src/meshquality.ts — additive. */
export interface MeshMeasureInput {
  // …every existing field…
  skinning?: SkinningResidualInput | null;   // left out = not asked: no row, no echo, the report byte for byte as before
}
```

**Where it lives — a measurement input, not a reduction target.** The
proposal put `skinning` on `ReductionTargets`, read at every step. The step is
#1295's; what this card needs is the reading, and `MeshMeasureInput` already
holds what the reading is taken over — the art and its threshold, the frame,
`minArtSamples` — so the setup contract, the sample set and the floor are the
measurement's own and nothing is restated. The measured mesh
(`MeshMeasureInput.source`) is the **candidate**; `skinning.source.mesh` is the
**comparison reference**, named by the caller's id and echoed with its sha-256
(the proposal's reduction had the source implicitly; a measurement does not).

**The row.** `MQ_SKINNING_RESIDUAL`, geometry section, unit `px` (drawing),
bound `<= maxResidual`, **required** exactly when `maxResidual` is a number. Its
value is the largest over the samples carried by both meshes of

  Σₖ εₖ |sₖᶜ − sₖʳ| + Σₖ |w̄ₖᶜ − w̄ₖʳ| (εₖ |pʳ − cₖ| + τₖ),

pʳ the source's setup position of the sample, sₖ = Σᵢ βᵢ wᵢₖ (xᵢ − p) each
mesh's weighted position moment and w̄ₖ its interpolated share, over the
bindings **as written** — after `InfluenceLimits` pruning and the 6-decimal
grid — so pruning and quantisation are inside the value. Samples: §3's set at
`art.threshold` — every art pixel centre, then every **source** hull UV —
carried by `uvCarriers` in each mesh; a sample one mesh does not carry is
listed by UV and left out (`samples.uncarried`). `uvCarriers` moved to
`src/meshcarriers.ts` for this, a module that links no poser, so `rig-c/mesh`
stays geometry-only (§0, P1) and the residual and `MQ_LOCAL_DEFORMATION` read
one definition of the carrying triangle; `rig-c/meshcompare` re-exports it
unchanged. `MeasureRow.skinning` (`SkinningDetail`) is written on this row when
it is measured and on no other: the reading sentence; `source: { id, digest }`;
`reference`; `samples: { measured, uncarried: { source, candidate } }`; at the
worst sample the two sums and each envelope bone's share of each (`worst`,
null when the value is 0); `weightField: { l1, lInf }` — the card's field-only
difference, a diagnostic computed in the same pass (its |Δw̄ₖ| are the lever
term's own), never a guard (Q6); and `setup: { vertexGap, vertexSlack,
sampleGap, weightSumGap }`, the contract's own figures. `effective.skinning`
echoes the input with the source as `{ id, digest }` rather than in full,
`null` included, only when the input set the field.

**The contract, checked rather than assumed.** The identity holds when each
vertex's shares sum to 1 and both meshes place one UV at one setup position.
The proposal asked for the second as "one affine image of its points"; the tree
already fixes which image — `compareMeshesInMotion` reconstructs a build's
points as its UVs times the frame — so the check is that map, within two `r6`
half-steps per axis (the point's and the UV's carried through the frame:
`(1 + width) × 1e-6`, `(1 + height) × 1e-6` px). On the 18 inputs of the
stage-D1 record every vertex is inside it; the largest gap is 3.46e-4 px against
a slack of 6.94e-4 (demo/bottomwear, y), and the largest share-sum miss
3.3e-16. What still passes — the setup positions of one UV in the two meshes
differing by that rounding — is reported beside the value as
`setup.sampleGap` and kept out of it: its term is
‖A₀ + Σₖ w̄ₖ (Aₖ − A₀)‖ |Δp|, and ‖A₀‖, the reference bone's own motion, is not
something the envelope declares. On the controls below it is 3.4e-5 px.

**Refusals and unmeasured states.** Malformed declarations throw
`REDUCE_INPUT_MISSING` naming the path (`skinning.source.id`,
`skinning.envelope.bones[0].linear`, `skinning.maxResidual is missing`, …)
before any work, as `motionAmplitude` does. What the measurement cannot read
is a `refused` row whose reason opens with its code, in the order a fix has to
happen in:

| code | when |
| --- | --- |
| `SKINNING_DEFORM_UNSUPPORTED` | a `vertices` **or** `transform` key in `skinning.deform` (Q10; a `transform` key moves vertices outside skinning just as a run does) — names animation, attachment and key |
| `SKINNING_UNWEIGHTED` | one mesh weighted and the other not |
| `SKINNING_BONE_NOT_DECLARED` | a vertex of either mesh binds a bone that is neither the reference nor in `envelope.bones` — names mesh, vertex and bone |
| `SKINNING_BONE_UNKNOWN` | an envelope bone no vertex of the source binds — names the entry and lists the source's bones |
| `SKINNING_WEIGHT_SUM` | a vertex's shares miss 1 by more than half a weight-grid step (5e-7) |
| `SKINNING_SETUP_MISMATCH` | a vertex off its UV carried through the frame by more than the slack above — names mesh, vertex, both positions |
| `SKINNING_UV_CARRIER_NOT_UNIQUE` | either mesh's UV triangles overlap at a sample (correction 4's refusal, read as this row's) |

`not-measurable`, never a value: both meshes unweighted; fewer art samples
than `minArtSamples`; no sample carried by both meshes; and `skinning: null`,
which also echoes `null`. A required row that is refused or not measurable
leaves the geometry verdict `not-measured` and the candidate not accepted.

**The helper.** `skinningEnvelopeBone(ranges): SkinningEnvelopeBone` on
`rig-c/mesh` — rig-c's definition of `linear`, as parts asked (Q3). Input: the
chain from the skeleton's root to the reference (`referenceChain`) and from the
reference's child down to the bone (`chain`), each bone a `BoneMotionRange`:
`source: 'keys'`, its setup joint in drawing px (`pivot`), its local rotation
range minus setup (`rotate`, degrees), its local scale over setup per axis
(`scaleX`, `scaleY`), the most its local translation moves its joint
(`translate`, drawing px) and its setup as the rig declares it. With
eⱼ = 2 sin(min(max |rotate|, 180°) / 2) + max |σ − 1| over the scale ranges'
endpoints and S = Π max σ over `referenceChain`:

- `linear` = S · (Πⱼ (1 + eⱼ) − 1) over `chain` — a product, since a chain's
  changes compose by multiplication; each factor is a triangle inequality,
  ‖R(θ) diag(σ) − I‖ ≤ ‖R(θ) − I‖ + ‖diag(σ) − I‖;
- `pivot` = the bone's own setup joint c;
- `translation` = S · δ₁ with δₘ = the bone's `translate` and
  δⱼ = eⱼ |c − cⱼ| + (1 + eⱼ) δⱼ₊₁ + translateⱼ — how far the chain above the
  bone carries its joint away from where the reference carries it.

Assumptions, refused by name where the input can show them
(`SKINNING_RANGE_UNSUPPORTED`): every range is declared by keys — `'physics'`
or any other source is refused, never certified; every bone of both chains has
a uniform setup scale, no setup shear and inherit `normal`, so every setup
world map is a similarity and conjugating by it keeps each norm. Assumed, not
checkable from the input: the drawing frame maps to world by a similarity, and
the chains are the bone's real ancestry. A range declares the motion it
covers; the entry claims nothing outside it.

**Example**, MQ79's ramp:

```ts
import { measureMeshQuality, skinningEnvelopeBone, type BoneMotionRange } from 'rig-c/mesh';

const still = (bone: string, pivot: [number, number]): BoneMotionRange => ({
  bone, source: 'keys', pivot, rotate: [0, 0], scaleX: [1, 1], scaleY: [1, 1], translate: 0,
  setup: { scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, inherit: 'normal' },
});
const b = skinningEnvelopeBone({
  referenceChain: [still('root', [-50, 74]), still('a', [0, 24])],
  chain: [{ ...still('b', [80, 24]), rotate: [-5, 5] }],
}); // { bone: 'b', linear: 0.0872388 (2 sin 2.5°), pivot: [80, 24], translation: 0 }
const report = measureMeshQuality({
  ...candidateMeasureInput, // the strict reduction, as any measurement of it
  skinning: { source: { id: 'source', mesh: source }, envelope: { reference: 'a', bones: [b] }, maxResidual: 1, deform: [] },
});
// MQ_SKINNING_RESIDUAL: fail, 1.807701 px — covariance 1.807701, lever 0; weightField { l1: 0, lInf: 0 }
```

**Measured** [measured, #1294] — `MQ116`–`MQ119` and `MQ130`–`MQ133` in
`mesh-compare` print every figure below on every run; these are one darwin run
(Apple M4, Bun 1.4.2, 1-minute load 7–9, other sessions running). The
population: MQ79's strip (6,880 samples: 6,828 art pixels and 52 hull UVs)
under seven fields and skeletons — the ramp; its far pivot (`b` 400 px off the
strip); its scale keys (1.15, 0.85) / (0.85, 1.15); kinked and diagonal ramps;
three bones `a → b → c` with Bernstein shares; three bones with `c`'s pivot
276 px below the strip's middle line and nonuniform scale keys — each source against its strict
reduction (MQ79's policy), and each three-bone source against its own bindings
pruned to two influences and closed on the grid: 9 candidates. Every envelope
is the helper's over the keys the fixture writes.

| candidate | residual | poser's `MQ_LOCAL_DEFORMATION` (`idle`, 12 fps, grid + irr) | poser / residual |
| --- | --- | --- | --- |
| ramp, strict | 1.807701 | 1.807703 | 1.000 |
| far pivot, strict | 1.807701 | 1.807707 | 1.000 |
| scale, strict | 4.915895 | 2.507863 | 0.510 |
| kinked, strict | 3.366786 | 2.436222 | 0.724 |
| diagonal, strict | 0.943159 | 0.943160 | 1.000 |
| three bones, strict | 9.557054 | 2.558105 | 0.268 |
| three bones, pruned to two | 4.645401 | 1.471431 | 0.317 |
| three bones, far pivot, scale, strict | 12.450149 | 3.237168 | 0.260 |
| three bones, far pivot, scale, pruned to two | 26.565787 | 6.830125 | 0.257 |

- **The bound never understates (`MQ118`).** Tolerance (1 + max εₖ) ×
  `sampleGap` + 1e-5 px — the term outside the value, ‖A₀‖ being 1 here because
  `a` never moves, plus the identity's measured band; worst understatement over
  the 9: 6e-6 px (far pivot), inside it. The ratio is 1.000 on a pure rotation
  (Aₖ − A₀ is a scaled rotation, so the norm loses nothing) and 0.26–0.72 where
  scale or a second moving bone makes the norm forget direction — as §7's M2
  measured on two bones. Each term is load-bearing: without the covariance sum
  the residual understates 6 of the 9 (every two-bone candidate and the
  three-bone strict one); without the lever, the two pruned candidates, where
  the field itself changes.
- **The identity (`MQ117`).** At the two key poses of each candidate (18
  pairs), Σₖ (Aₖ − A₀) Δsₖ + Σₖ Δw̄ₖ (Dₖ − D₀) pʳ + (A₀ + Σₖ w̄ₖᶜ (Aₖ − A₀)) Δp,
  with each Dₖ read off the core poser, reproduces the poser's per-frame value
  within 1e-5 px, worst 5.42e-6 — on three bones, a far pivot, nonuniform scale
  and pruning, where §7's measurement had only two bones. Without its covariance
  term it is up to 2.507831 px off.
- **A zero field difference is not a zero error (`MQ116`).** On MQ79's ramp
  the field-only difference is 0 in L1 and L∞ while the residual reads
  1.807701, all of it covariance, against the poser's 1.807703; the source
  against itself reads 0 with nothing worse than ideal.
- **Positions only (`MQ119`).** The ramp bent ±15°, the source with the two
  triangles at its top middle vertex re-triangulated as a rim sliver (height
  the rim's 0.08 px sag, no art pixel centre inside it) and the triangle under
  it: residual 0.092357, pass at 1; static geometry pass; the poser's local
  deformation 0.092371, pass; `MQ_INVERSION` 1, **fail** (at `idle@grid@0.416667`).
  The source as its own candidate: 0 reversed. The residual certifies no
  orientation, and the comparison stays the acceptance.
- **Rigid relative motion (`MQ130`).** Two rigid halves (`a` left of the middle
  column, `b` from it): the seam kept by `protect.weightJump: 1` — 42 vertices,
  residual 0, poser 3.4e-5, both pass; the strict reduction smearing it — 28
  vertices, residual 3.435165 and poser 2.528356, both fail, and without the
  covariance sum the residual reads 1.039742, an understatement. Every vertex on
  the moving bone: residual 0, poser 3.4e-5. Over the population at 1 px, the
  residual passed one candidate (diagonal) and the poser passed it too; it
  passes no candidate the poser fails.
- **The helper (`MQ133`)**, against the largest ‖Aₖ − A₀‖ and |(Dₖ − D₀) cₖ|
  the core poses over `idle` at 48 steps a second: equal on every one-bone chain
  (0.087239, 0.237239 with scale); on three bones `c`'s `linear` 0.258788
  against 0.069799 posed (`b` and `c` turn opposite ways, which a norm bound
  cannot know) and `translation` 5.861627 against 5.861627; with the far pivot
  and scale 0.272973 against 0.152354 and 29.478108 against 29.478107. The
  poser's own matrices carry rounding the exact rotation does not (5.4e-9 in the
  linear part, 1.7e-6 px at a joint 468 px from the origin), so the claim is
  held within 1e-8 and 1e-8 × |cₖ| + 1e-6 px. Ignoring scale understates the
  scale bone; ignoring the joint's motion understates both three-bone `c`s.
- **Calls without the field** write every byte as before: against `e948469` on
  the 18 inputs of the stage-D1 record, 70 of 70 — 18 reduction reports, 18
  meshes, 18 measurements of the source and 16 of the result (two inputs return
  no mesh). In suite, `MQ132` holds the shape: no key and no row without it;
  with `maxResidual: null` every byte but the row, its echo and the summary
  unchanged; one text twice and in reverse key order.

**Cost** [measured, #1294], standalone, one measurement with the field against
the same measurement without it, median of five, same machine and load.
Recorded inputs are named only; their envelope is a stand-in (every bound bone
at `linear` 0.1 about the origin) because parts's ranges are parts's — the cost
does not read the values.

| subject | vertices, candidate / source | samples | measurement without, ms | with, ms | residual, ms | heap growth in the call, MiB |
| --- | --- | --- | --- | --- | --- | --- |
| MQ79 ramp, strict | 28 / 147 | 6,880 | 8.2 | 63.1 | 54.9 | 3.0 |
| MQ79 ramp, source against itself | 147 / 147 | 6,880 | 7.6 | 84.3 | 76.7 | 3.0 |
| demo/neck | 14 / 89 | 2,225 | 1.4 | 12.7 | 11.3 | 0.0 |
| sample/neck | 26 / 107 | 3,375 | 3.2 | 16.7 | 13.5 | 0.0 |
| scarf/hair_front | 53 / 123 | 5,461 | 3.3 | 35.0 | 31.7 | 2.4 |
| scarf/handwear_l | 67 / 378 | 22,436 | 24.5 | 295.5 | 271.0 | 9.8 |
| sample/topwear | 63 / 142 | 31,250 | 24.5 | 174.1 | 149.6 | 12.2 |
| sample/sleeves | 190 / 231 | 44,410 | 119.7 | 588.8 | 469.1 | 23.3 |
| sample/bottomwear | 101 / 230 | 111,411 | 62.0 | 1,110.3 | 1,048.2 | 48.8 |
| demo/bottomwear | 282 / 536 | 351,276 | 159.1 | 5,718.4 | 5,559.3 | 153.8 |

⚠️ **Changed by [implemented, #1295]:** `uvCarriers` now buckets the samples
on a uniform grid and tests each live triangle only against the samples in
the cells its box overlaps — the same `carrierIn` test, each sample's hits in
the same ascending triangle order, so the same carriers (34 of 34 carrier
lists identical on the recorded inputs' sources and reductions) — and the
paragraph below describes the search as it was. Measured [measured, #1295] as the table below was — the measurement with the
field against it without, median of five, the released search and this one
in turn on one darwin machine at load 5.5–8.7: the residual's share on
demo/bottomwear 3,448 → 954 ms, sample/bottomwear 660 → 437 ms, and within
the noise on the six smaller subjects (5–117 ms either way). The rest of the
residual's cost is `termsAt` and `sampleResidual` per sample.

The work is one carrier search per sample in each mesh — `uvCarriers` tests
every sample against every live triangle's box, so it grows with samples ×
triangles (351,276 × 777 on the largest) — plus one pass over the carrying
corners' bindings per sample. A per-step veto that recomputed it would cost
that at every step; #1295's carried form re-reads only the samples in the
triangles a step changed, and the carrier search is where it pays. No speed
target is claimed here.

**Rejected on the way.** (1) A plant reading the lever about the drawing's
origin rather than each pivot: it understated no candidate of the population,
so it was dropped rather than kept as a control that cannot fire. (2) Composing
the chain by summing the eⱼ rather than multiplying: on the fixtures the sum
was never measured below the posed norm, so the product is chosen for being
provably conservative, not for a measured failure of the sum, and no plant of
it is claimed. (3) A separate undeclared row for the field-only difference:
its values are the lever term's own, so it is a field of the residual's detail
— it costs nothing separately and adds no row to any summary.

### Mechanism 1 — implemented, the reducer half [implemented, #1295]

[#1295](https://github.com/rig-c/core/issues/1295) makes the residual a
step condition of `reduceMesh`, reading the measurement half above — the same
envelope, the same samples, the same per-sample arithmetic
(`sampleResidual`), the same contract and refusal codes — and carries it from
step to step instead of recomputing it. The proposal further down is kept as
written; this subsection departs from it where it says so.

```ts
/** src/meshskinning.ts — on rig-c/mesh through src/mesh.ts's `export *`. */
export interface ReductionSkinning {
  envelope: SkinningEnvelope;   // the measurement's own type
  maxResidual: number | null;   // drawing px, inclusive; null = declared absent: no step reads it, the result's row undeclared
}
/** src/meshquality.ts — additive. */
export interface ReductionTargets {
  // …every existing field…
  skinning?: ReductionSkinning | null;   // left out = no step reads a residual: the call as before, byte for byte
}
```

**The opt-in.** The card's name and shape, `targets.skinning: { envelope,
maxResidual }`. The comparison reference is the call's own `source` — the
original supplied mesh, fixed for the whole call — so it is not restated,
and the `deform` the measurement reads is the call's own `deform`. Left out,
nothing reads it (`MQ140`). `null` is handled as the other optional inputs:
no step reads it, the result's measurement is handed `skinning: null` so its
row is `not-measurable` saying it was declared absent, and
`effective.targets.skinning` is `null`. `maxResidual: null` declares the bound
absent: no step reads it, and the result's row is measured and `undeclared`.
Anything else that is not `{ envelope, maxResidual }` in full is refused
`REDUCE_INPUT_MISSING` before any work, in the measurement's words under
`targets.skinning` (`targets.skinning.envelope.bones[0].linear is -1`,
`targets.skinning.maxResidual is missing`, `targets.skinning is 5` —
`validateReductionSkinning` and the measurement's validator share one
function). The echo is `effective.targets.skinning`, written after `regions`
only when the input set the field.

**What is held, and when.** With a number for `maxResidual`, every proposed
single removal, boundary run and post-pass is taken only if every required
row passes as before **and** the residual of its result against the original
source is within the bound. The residual is read after the rows pass, so the
candidate it reads has no reversed or degenerate triangle; a residual over
the bound is a refusal like any other — named `MQ_SKINNING_RESIDUAL: <value>
against <= <bound>`, the working mesh and the carried state as they were, the
attempt counted, the search going on within the budget (`MQ134`), and
`acceptedAt` recording accepted operations only. The order, the budget, every
other row and bound, and the opt-out order are unchanged; no poser is
linked. **Refinement insertions are not vetoed one by one**: an insertion is
there to meet a region's `L(R)`, and a refinement step is not required to meet
the targets, only the steps after it; so the **refinement's outcome** is held
to the residual whole, at the start check that already holds it to every row
before any removal. An insertion carries the state forward like any step.
Inserted vertices interpolate their weights and are pruned by
`InfluenceLimits`, and the residual reads that: on the three-bone strip with a
density region, insertions pruned to two influences make the refined source
read 4.107752 px, and at a bound of 1 the reduction stops before any removal
naming the row (`MQ137`, last case) — with four influences it reads 0.052872
and the reduction proceeds.

**The post-pass.** `retriangulate: 'delaunay'` is held to the residual on the
triangulation it returns, after every required row, and refused whole naming
the row when it is over (`MQ141`; on the ramp at 0.1 the real pass is refused
by it, `MQ135`). It is not in `acceptedAt`, and that is no reason for it to
escape the bound: with the recheck planted away and the inverted flip
criterion planted in, the pass is taken and the result reads 1.157474 against
1. The replay semantics are #1283's: a replay and the budget cut at the same
step end on the same state and both are followed by the pass (`MQ139`).

**Admission and what cannot be measured.** Before any step the measurement's
contract is checked on the source against itself (`skinningContract`, the
checks `skinningResidual` makes before it carries a sample). A source the
measurement refuses is refused here, `invalid-input` with the measurement's
code and words — `SKINNING_DEFORM_UNSUPPORTED` for a `vertices` or
`transform` key in the call's `deform`, `SKINNING_BONE_NOT_DECLARED`,
`SKINNING_BONE_UNKNOWN`, `SKINNING_WEIGHT_SUM`, `SKINNING_SETUP_MISMATCH`,
`SKINNING_UNWEIGHTED`, `SKINNING_UV_CARRIER_NOT_UNIQUE`. What it cannot
measure — both meshes unweighted, fewer art samples than `minArtSamples` — is
kept as the reading every step is blocked by, so the reduction ends
`no-further-valid-reduction` before any removal naming
`MQ_SKINNING_RESIDUAL: not-measurable — …`; it never becomes a pass. An
inserted vertex is checked against the share-sum and setup contract when it
first appears (the measurement checks every vertex of the candidate); a miss
refuses every reading after it. The outcomes stay distinct (`MQ138`): no-op
(every vertex protected, a stop naming `protect:`), budget exhaustion,
refusal by code, not measurable, and a malformed declaration thrown.

**The carried state** (`SkinningCarry`, `src/meshskinning.ts`):

- **Fixed for the call:** the §3 samples, each one's carrier in the source
  and the source's terms there — one `uvCarriers` over the source, whose
  carriers are also the working mesh's at the start — and the envelope. The
  baseline is the source supplied and is never moved.
- **Carried:** per sample, the candidate's carrier (triangle, barycentric)
  and its value; per triangle, the samples it carries; a max tree over the
  values, so the row's value — the largest, lowest sample index on a tie, as
  the measurement picks it — is re-derived in O(log n) when the sample that
  held it is recomputed, never by a scan.
- **A trial** diffs the working triangles against the carried ones by
  identity (corners rotated to the smallest id, winding kept). The samples of
  every removed triangle, and the samples no triangle carried that lie in an
  added triangle's box (art pixels looked up on the mask grid, hull UVs
  tested), are searched among the added triangles — and a sample a removal
  leaves outside all of them among the unchanged triangles that share a
  vertex with a removed one, where it can still lie on an edge. Everything
  else is untouched. Containment and the several-carriers rule are
  `uvCarriers`' own (`carrierIn`, `resolveCarriers` in
  `src/meshcarriers.ts`, which `uvCarriers` now calls).
- **Commit or rollback:** a refused trial restores every carrier, value,
  per-triangle list, count, live flag and the maximum.
- **Work per trial:** one pass over the working triangles (their keys and the
  area band) plus, for each affected sample, the added triangles (and, when
  needed, the neighbours) tested. **Memory:** per sample three doubles of
  barycentric, an integer carrier, a value, two tree slots, and the source's
  terms (2 + 3K doubles, K the envelope's bones plus the reference); per
  triangle its corners, area, box and sample list.
- **The one full rescan, bounded:** the live set — triangles whose UV area
  clears `areaBand`, which reads the largest triangle — can move a triangle a
  trial did not touch across the band. A trial that does re-carries every
  sample against every live triangle and counts it (`CarryTally.fullRecarries`).
  It is taken only then, at most once per trial, and was taken 0 times on every
  call measured below.

**Held to the full recompute** [measured, #1295] (`MQ135`). After every
decision the residual took part in — accepted and refused, single removals,
boundary runs, refinement insertions, and the post-pass taken and refused —
the carried state is compared sample by sample with the measurement's own
path over the canonical candidate (`uvCarriers`, `termsAt`, `sampleResidual`):
the same samples measured, the same uncarried counts, every value within
`CARRY_TOLERANCE` (1e-9 px), the same maximum. Over three calls on the ramp
(a density region with runs and the post-pass at 0.05; runs, the load order
and the post-pass at 0.1; the post-pass at 1): insertion 146, single removal
291 accepted and 92 refused, boundary run 6 accepted and 8 refused, post-pass
1 taken and 2 refused — every one equal, the largest sample difference
5.44e-15 px. The tolerance is the order a triangle's corners are summed in
(the working mesh's against the canonical mesh's) and, for a sample on a
shared edge, which triangle carries it. The same calls run with the residual
measured whole on every trial (the `full-recompute` control) write the same
report and mesh byte for byte. Each plant leaves the state off the recompute:
`stale-carrier` (a removed triangle's samples not re-carried) at the first
accepted run, `lost-maximum` (when the sample holding the largest value is
recomputed, the largest taken over the recomputed samples alone) at an
accepted removal, `no-rollback` at the first refused run. `lost-maximum`
fires only where the largest value falls at its own sample while another
sample keeps a larger one — measured, it did not fire on the single-removal
ramp at 0.05, 0.3 or 1, nor with the post-pass alone at 0.05, so the control
plants it on the call where it does. Outside the suite, 27 calls (the ramp
and the kinked ramp × seven option sets × bounds 0.5, 1, 2; the run was
stopped there) were checked the same way with no difference (largest
1.1e-14 px), each also equal to its full-recompute run byte for byte; the
`MQ137` population is checked in the suite.

**Accumulated error against the fixed source** (`MQ136`): on the ramp at 1,
117 accepted steps, the largest reading 0.990321 — the result's. The plant
that measures each step against the previous accepted candidate instead
lets small steps add up to the strict result, 1.807701.

**On the ramp** (`MQ134`): the first veto is attempt 123 (removing vertex 122,
1.132489), the next attempt is taken, and the reduction ends at 28/2, 30
triangles, residual 0.990321 — §7 M2's scratch step condition, now in the
tree. Recorded apart, the poser on that result: `MQ_LOCAL_DEFORMATION`
0.990322, `MQ_INVERSION` 0, accepted in motion; the bound did not understate
it. The final motion comparison stays the acceptance — the residual certifies
no orientation (`MQ119`) — and nothing here claims a minimum, the last valid
prefix, or impossibility outside this search.

**Work and cost** [measured, #1295]. One darwin run, Apple M4, Bun 1.4.2,
load 4.0–4.6 (other sessions running); each reduction run alone in one process, medians of three (one on the
two bottomwears). The recorded inputs' envelope is a stand-in — every bound
bone at `linear` 0.1 about the origin, no reference bound, `maxResidual` 1 —
because parts's ranges are parts's; it decides which steps are vetoed, so the
counts below are this envelope's. "Full" is the `full-recompute` control —
the measurement called on every trial — at a budget capped at 40 candidates
on the recorded inputs (uncapped, it is hours on the largest), paired with
the call without the field and the carried call at the same cap.

| subject | samples | vertices / triangles | without the field, ms (candidates) | carried, ms (candidates, trials) | per trial: samples recomputed / containment tests (peak samples) | carried memory, MiB | full recompute, whole call, ms | at 40 candidates: without / carried / full, ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MQ79 ramp (helper envelope) | 6,880 | 147 / 240 | 158 (175) | 222 (177, 121) | 401 / 1,641 (1,974) | 0.93 | 1,162 | — |
| demo/neck | 2,225 | 89 / 162 | 23 (103) | 56 (127, 85) | 281 / 1,276 (972) | 0.37 | 188 | 13 / 22 / 82 |
| sample/neck | 3,375 | 107 / 186 | 33 (133) | 71 (179, 101) | 287 / 1,216 (1,023) | 0.55 | 290 | 15 / 22 / 78 |
| scarf/hair_front | 5,461 | 123 / 190 | 53 (176) | 163 (241, 135) | 195 / 793 (335) | 1.53 | 943 | 12 / 25 / 44 |
| sample/topwear | 31,250 | 142 / 216 | 87 (205) | 394 (332, 143) | 1,760 / 7,263 (6,813) | 4.96 | 3,100 | 30 / 79 / 221 |
| scarf/handwear_l | 22,436 | 378 / 683 | 445 (445) | 1,444 (1,036, 768) | 314 / 1,295 (1,123) | 4.71 | 27,673 | 57 / 109 / 247 |
| sample/sleeves | 44,410 | 231 / 262 | 286 (421) | 740 (458, 79) | 1,856 / 9,665 (3,149) | 12.49 | 7,682 | 120 / 274 / 682 |
| sample/bottomwear | 111,411 | 230 / 351 | 273 (331) | 1,573 (457, 255) | 2,290 / 9,783 (4,690) | 40.66 | 77,099 | 59 / 342 / 1,224 |
| demo/bottomwear | 351,276 | 536 / 777 | 1,560 (1,101) | 5,151 (1,062, 496) | 3,810 / 17,208 (5,152) | 129.08 | 680,567 † | 197 / 1,235 / 2,196 |

A trial is a candidate the rows let through, plus each insertion and
post-pass; every other candidate costs the residual nothing. The carried
call and the full-recompute control end on the same mesh on every subject
above (byte for byte), and the carried state took no fallback rescan
(`fullRecarries` 0 on every call). What the carried form brings the
full-recompute cost to: on the ramp, the card's subject, the call is 1.4 times
the reduction without the field (222 against 158 ms) where measuring the
residual whole on every trial is 7.4 times (1,162 ms) — and was 23 times
(3,635 ms, same machine, an hour earlier) before `uvCarriers`' search was
bucketed (below); on the recorded inputs, the full recompute is 2.4 to 132 times
the carried call, growing with samples × trials (†: 11 minutes, measured while another job raised the load to 19, so it is an order of magnitude, 132 times, not a pairing). What the carried call still
pays at a fixed cost per call is its construction — the source's carriers and
terms, 0.5 s on demo/bottomwear — and the result's own row, measured in full
by the measurement (0.56 s there); at a cap of 40 candidates those two are
most of the 1.2 s. Against the call without the field the carried call costs
1.4 to 5.8 times: the vetoes change the trajectory (on demo/bottomwear this
stand-in envelope lets 10 vertices go where the call without it removes 254,
after a similar number of candidates), so the two are paired runs of
different reductions, not of the same steps. Memory is the source's terms
per sample: (2 + 3K) doubles, K the envelope's bones plus one — 129 MiB on
demo/bottomwear (351,276 samples, 11 bones) — plus 8 doubles' worth per
sample of carrier and value; it is held for the call and dropped with it. The
load was 4.0–4.6 throughout (other sessions running), each call measured
alone in its process; the population is the 9 weighted recorded inputs (one
refused by the reduction's own admission before the residual is read,
sample/hair_back, omitted) and the ramp.

**Rejected on the way.** (1) Re-scanning every live triangle per affected
sample, as `uvCarriers` does: it is the cost #1294 measured growing with
samples × triangles, and a removed triangle's samples can only land in the
triangles that replaced it or, on an edge, in a neighbour. (2) Vetoing each
refinement insertion: a refused insertion leaves `L(R)` unmet, so the
refinement could not finish, and a refinement step was never required to meet
the targets — the outcome is what is held. (3) Reading the residual before the
rows, to spare the measurement of vetoed candidates: a candidate the rows
refuse may fold, and then the carried search could disagree with the
measurement's refusal of overlapping carriers; reading it after keeps the two
equal, and the rows' own order and names unchanged. (4) Keeping the carried
state bit-equal to the measurement by summing in the canonical mesh's corner
order: the canonical order of unchanged triangles moves when a hull vertex
goes, so that would re-sum them; the difference is 1e-14 px and is declared.

### Proposed [proposal]

**Mechanism 2 — intermediate candidates, by replay.** [implemented, #1268] —
see the subsection above; the proposal is kept as written, and the
implementation departs from it in three places, each for a reason stated
there: `acceptedAt` counts refinement insertions too (one count for the list
and the replay); the promise is `stopAfterAccepted`, not
`budget.maxCandidates` (parts's Q2, and a budget cut inside a refinement
returns no mesh); and a replay inside a refinement returns the mesh rather
than being refused. The minimum is a promise
and a list, both additive:

```ts
/** [proposal] Additive on ReductionChanges (src/meshquality.ts). */
export interface ReductionChanges {
  // …every existing field…
  /**
   * The value of `candidatesTried` at which each removal step was taken, ascending —
   * one integer per removed vertex. Refinement insertions are not in it.
   */
  acceptedAt: number[];
}
```

- **The promise:** for every *j*, `reduceMesh` of the same input with
  `budget.maxCandidates = acceptedAt[j]` returns the mesh after exactly the
  first *j* + 1 removals, byte for byte (the 119/119 above, made a contract and
  a control), and with `maxCandidates` 0 the canonical source with nothing
  removed (with a region declared, the refined source — refinement steps count
  against the same budget, so replay below their number is not a prefix of
  the reduction and is refused by name). Work:
  replaying step *j* costs `acceptedAt[j]` attempts, never more than the
  original call; memory: the list.
- **Outcomes:** source / no-op (`acceptedAt` empty, or replay at 0); reduced
  (any replay); the original call's result (the last entry). It never says
  *minimal* and never says *the last valid prefix*: validity along the order was
  measured not monotone at some bounds.
- **Schedule honesty:** every frame a consumer uses to pick a replay is
  `selection`; a held-out claim needs frames disjoint from them (another phase,
  another animation), or none is made.
- **Cannot certify:** anything about meshes off the order. The prefixes of the
  static order are one family; the fixture's best prefix keeps 53 vertices
  where `weightJump` 0.11 and the residual condition reach 30–42.
- **Rejected:** returning meshes (`checkpoints: { every: k }`) as the first
  form — 0.96 MB for this fixture's 119 steps against 119 integers, and replay
  costs one call; it can be added later if a consumer measures replay as too
  slow.

**Mechanism 1 — the weight-interpolation measurement, restated.** [implemented,
#1294, the measurement half; #1295, the reducer half — *Mechanism 1 —
implemented, the reducer half*, which departs from the last two bullets of the
row's text below: the post-pass is held too, refinement insertions are held as
an outcome rather than one by one, and the carried work is measured there] — see *Mechanism 1 — implemented, the measurement
half* above; the proposal is kept as written, and the implementation departs
from it where that subsection says: a measurement input
(`MeshMeasureInput.skinning`, the source named in it) rather than a reduction
target, the per-step use left to #1295; the setup refusal read as the tree's
own UV-to-frame map; a share-sum and a coverage refusal added; `transform` deform
keys refused beside `vertices` keys; the field-only diagnostic a field of the
row rather than a row; and the envelope's entries derivable by
`skinningEnvelopeBone`. As the card
words it (the source and candidate weight fields over a common UV domain) it is
measured above to read 0 where the motion error is 1.8 px, so it is proposed
only as the second factor of a bound that also carries the first:

```ts
/** [proposal] The motion a reduction must stay correct under — declared, never posed. Part-local drawing px, y down. */
export interface SkinningEnvelope {
  /** The bone every other bone's deformation is measured against (D₀). Usually the slot's bone. */
  reference: string;
  bones: Array<{
    bone: string;
    /** εₖ ≥ the spectral norm of (Aₖ − A₀) over the motion; dimensionless. A rotation by up to θ is 2·sin(θ/2). */
    linear: number;
    /** cₖ: the pivot of the lever bound |(Dₖ − D₀) p| ≤ εₖ·|p − cₖ| + τₖ. */
    pivot: [number, number];
    /** τₖ, px. */
    translation: number;
  }>;
}

/** [proposal] Additive on ReductionTargets. Absent = today's behaviour, byte for byte. */
export interface ReductionTargets {
  // …every existing field…
  skinning?: { envelope: SkinningEnvelope; maxResidual: number };
}
```

- **The row:** `MQ_SKINNING_RESIDUAL`, geometry section, unit `px`
  (drawing), bound `<= maxResidual`; value the largest over samples of the
  bound above. Samples: §3's set — every art pixel centre at the final
  threshold and every source hull UV — carried by `uvCarriers` in the source
  and in the candidate (correction 4's refusal applies); a sample either mesh
  does not carry is listed, as §3 lists it, and left out. Weights: each mesh's
  bindings **as written** — after `InfluenceLimits` pruning and the 6-decimal
  grid — so pruning and quantisation error is inside the value, never beside
  it. Coordinates: drawing px; converting to world is the setup map's job
  (`MotionRowDetail.setupMap`), and the row is not stated in world units
  because no single ratio exists under non-uniform scale (correction 4).
  The derivation assumes the source and the candidate place each UV at the same
  setup position — a removal keeps both, an insertion interpolates both (§6) —
  so a source whose UVs are not one affine image of its points makes the row
  `refused`, naming the vertex. Reported by `measureMeshQuality` when `targets.skinning` is given, required
  by `reduceMesh` at every step when it is.
- **The diagnostic** the card asked for — the weight-field difference in L1 and
  L∞, worst sample — as an undeclared row beside it, never a gate alone.
- **Work and memory:** carried per step as `StepRasters` carries the art rows:
  a step changes the carriers only of samples in the triangles it removed and
  added, so only those are re-read. The full recompute measured above
  (861–910 ms against 59–68 ms) is not acceptable as written.
- **Outcomes:** unchanged — `no-further-valid-reduction` naming
  `MQ_SKINNING_RESIDUAL` when it blocks, `budget-exhausted` as today; a source
  that fails its own residual cannot (it reads 0 against itself).
- **Schedule honesty:** it reads no frame, so it selects with none; the final
  comparison can be wholly held out **provided the envelope was declared before
  any comparison was read** — an envelope tuned until a comparison passed is a
  selection made through the envelope.
- **Cannot certify:** motion outside the envelope; `MQ_INVERSION`,
  `MQ_STRETCH`, `MQ_SQUASH` (measured: a residual-gated candidate reversed a
  triangle); `vertices` deform keys, whose offsets a removal drops (§6, P18);
  physics, unless the consumer bounds the simulated bones in the envelope. So
  `compareMeshesInMotion` stays the acceptance; the residual only keeps the
  search where acceptance is likely.

**Mechanism 3 — a motion-aware search.** It needs the poser, and `rig-c/mesh`
links none and must not (§0, P1; the reduction is pure). So inside rigc it
could only be a composed operation on `rig-c/meshcompare` — replay over
`acceptedAt`, compare, keep the best — which is the same two calls parts can
compose today, with no measurement rigc could add to them. It is proposed to
stay in parts, with rigc's part being mechanism 2's promise. If parts wants it
in rigc instead, the signature would be
`reduceMeshInMotion(reduction: MeshReductionInput, comparison: Omit<MotionComparisonInput, 'candidates'>): MeshQualityReport`
on `rig-c/meshcompare`, every frame it reads recorded as `selection`, and it
would add no row and no bound of its own.

### Recommendation

From the measurements: **mechanism 2 first, in its minimum form** — the
prefix promise and `acceptedAt`. It adds no measurement, no poser and no memory
beyond integers, its property was measured byte-exact on every step, and it
lets parts recover a less-reduced, motion-valid candidate from any failed
reduction today (8 replays and 8 comparisons, 0.76 s on the fixture), with
honest roles because parts does the choosing. Its limit is that it only walks
back along the static order (53 vertices where 30–42 were reachable here), and
it can miss the last valid prefix at bounds where validity is not monotone.
**Mechanism 1, restated as the envelope residual, second** — it is the one that
moves the reduction itself towards motion-valid meshes without posing or
selecting a frame (30–31 vertices, every one within 1 px on six variants), and
its derivation was measured exact to 2·10⁻⁵ px; but it needs a carried
implementation (the naive one is 15 times the reduction), an envelope parts can
declare (Q3), and it cannot replace the comparison (inversion). The card's
field-only form is **not** recommended as a gate: it read 0 on the very
fixture that fails at 1.8 px. **Mechanism 3 stays in parts.** And before any
of it, the M1 table says the existing `weightJump` above the source's own edge
jump already yields reduced, motion-valid candidates on this fixture — a sweep
parts can run privately now, recording the frames it chose by as `selection`
(Q7).

### Open with parts

Answered on rig-parts#126 (comment 6072801422); Q1, Q2 and Q9 are folded
into *Mechanism 2 — implemented*, observation (a) of Q7 into *`weightJump` at
exactly J*, and the rest wait for mechanism 1's card. The questions as asked:

- **Q1.** Is `ReductionChanges.acceptedAt` with the replay promise enough for
  parts's retry, or does parts need meshes returned, and at what limit of
  steps or bytes?
- **Q2.** A replayed prefix is reported `budget-exhausted` /
  `best-meeting-every-bound`. Is that acceptable, or should replay be its own
  input field (`stopAfterAccepted: number`) with its own termination, so it is
  not read as an exhausted budget?
- **Q3.** Can parts declare the envelope per bone — `linear` (εₖ), `pivot`,
  `translation` — from the motion it declares, including bones physics drives?
  Should rigc ship the helper that turns a rotation and scale range into `linear`,
  or is that parts's?
- **Q4.** Which bone is `reference` (D₀): the slot's bone always, or declared
  per attachment?
- **Q5.** `maxResidual` in drawing px, as proposed, or in world units through
  the setup map's largest singular scale?
- **Q6.** Is the field-only difference wanted as an undeclared diagnostic row,
  or omitted?
- **Q7.** On the two private attachments: what is the largest source edge jump
  (as `MQ79` derives it), and does a `weightJump` just above it reduce and pass?
  Aggregate figures only.
- **Q8.** Mechanism 3 stays in parts — agreed, or is a composed operation on
  `rig-c/meshcompare` wanted?
- **Q9.** For a replay chosen by comparison, is the held-out set parts will
  report the `irr` phase of the same animations, another animation, or none
  (`heldOutClaim: false`)?
- **Q10.** `targets.skinning` with a `vertices` deform key on the attachment:
  refuse by name, as P18's first path has no such keys anyway?

## 8. Vertex allocation under contour and motion bounds (#1271)

> **One part of this section is implemented**: the five spatial measurements
> of allocation, as `undeclared` rows, and the amplitude declaration two of
> them read — [agreed, rig-parts#126] by parts's answers to Q2 and Q7,
> [implemented, #1280] in *Implemented — the allocation rows* below. The rest
> is Stage A of [#1271](https://github.com/rig-c/core/issues/1271): a
> public reproducer (`MQ85`–`MQ90`, `mesh-compare`), the measurements made on
> it and on the inputs recorded for stage D1, and the questions for parts at
> the end. The reproducer holds today's behaviour; no bound, order,
> termination or emitted byte changes. Marks as in §7: **Existing** cites the tree by path and
> symbol; **[measured, #1271]** is a figure taken for this section — from the
> stage-A record for #1271 (scratch scripts that import the tree at `5614f63`,
> v2.24.0, and write nothing into it) or printed by the controls — with the
> machine beside it; **[proposal]** is unsettled until parts answers by number.
>
> **Stage B's first landing is implemented** — boundary runs taken as steps and
> `acceptedAt` one entry per operation, [implemented, #1279], in *Stage B —
> boundary runs as steps* at the end of this section, with the decisions it
> rests on [agreed, rig-parts#126]. **So is its second** — the triangulation
> post-pass and the weight-aware removal order, both opt-in, [implemented,
> #1283], in *Stage B — triangulation post-pass and weight-aware order* after
> it. Everything above them is Stage A as recorded, and the reproducer's
> figures (`MQ85`–`MQ90`) are unchanged by either: they are a call without the
> opt-ins. The reduction also carries the allocation rows' amplitude into its
> result's measurement, [implemented, #1287], in *Stage B — the amplitude on a
> reduction* at the end of this section. After it: what Δ's gradation G derives
> from, measured, and the comparison's own amplitude, [implemented, #1291]; and
> rig-parts's rerun of all of Stage B on its eight public parts, [observed,
> rig-parts PR #147].

The consumer's problem, in its own aggregate figures: after #1266's replay
(parts PR #141), two attachments reduce to motion-valid meshes — A from 109/145
boundary/interior to 108/71 (step 75 of 146), B from 104/152 to 102/106 (step 48
of 155), each in 7 replays — while removing only 1 and 2 boundary vertices; the
triangle-area P90 of A's replay is 513 px² against the source's 162. Its
policy is the one §7 used: coverage 1, overshoot ≤ 3, undercut 0, boundary
deviation ≤ 1, influences `{ 4, 0 }`, budget 5000, an isolated ±5° bend at
12 fps, selection on `grid` and `irr` held out, local deformation ≤ 1 with no
inversion. The card is explicit that density is not a defect in itself — a
curved contour and a bend legitimately need samples — and asks which of four
things keeps the boundary dense beside a thinned interior: the boundary
constraints, the initial sampling, the removal order and replay cut, or the
triangulation. The ownership line is §7's: geometry in `rig-c/mesh`, the
motion selection loop in parts.

### Existing

- **The deviation reference is the source's own hull.** `reduceValidated`
  (`src/meshreduce.ts`) takes `sourceHull` as the first `source.hull` points of
  the input and measures every step's `MQ_BOUNDARY_DEVIATION` against it —
  [agreed, P13]: the traced outline is the diagnostic `MQ_TRACE_DEVIATION`,
  never required (*Stage B scope*).
- **The order is already boundary-first.** Hull vertices are source indices
  `0 … hull − 1` and `removeVertices` sweeps surviving vertices in ascending
  source index, so every pass offers the boundary first.
- **A removal's hole is ear-clipped.** `removalOf` (`src/meshreduce.ts`)
  re-triangulates the ring a removed vertex leaves with `earClip`
  (`src/mesh.ts`): the triangulation is a function of the removal sequence, and
  no step changes an edge outside that ring.
- **`buildContourMesh`** (`src/mesh.ts`) traces the alpha on the pixel-corner
  lattice, simplifies it by Douglas–Peucker at `tolerance` and offsets it by
  `margin` — the outline a consumer typically hands `reduceMesh` as its hull.

### The fixture

`abSource` and `abBuild` in `selftest.ts` (beside the `mesh-compare` suite): a
superellipse "bean" (exponent 2.5, half-axes 148 × 56 px, times 1.3) in a
416 × 195 window, its centre line arched toward the ends, its radius perturbed
by 1.5 × (0.6 sin 37θ + 0.4 sin(61θ + 1.3)) px — an organic edge whose
amplitude is the tolerance's order (47,364 art pixels). The boundary is
`buildContourMesh` at **tolerance 1, margin 1** (107 vertices); the interior a
grid every 18 px kept 6 px clear of it (129 vertices), Delaunay-triangulated
with it (363 triangles). Bones `a → b → c` along the long axis, `b`'s share
ramping in by smoothstep over x 117–195 and `c`'s over 234–312, rigid outside;
two animations, each an isolated ±5° bend of one joint over 2 s. The policy and
the comparison are the card's (above), physics `none`. The interior placement
is the fixture's, not parts's (parts's is not public); the boundary half of the
symptom does not depend on it (below).

### Measured — the reproducer [measured, #1271]

Printed by `MQ85`–`MQ89` on every run, and equal to the record's figures;
darwin, Apple M4 (10 cores), Bun 1.4.2, 1-minute load 4–10 with other sessions
running. Motion in px, worst frame.

| mesh | step | boundary / interior (total) | removed boundary / interior | triangles | selection (`grid`) | held out (`irr`) | inversions | accepted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| source | 0 | 107 / 129 (236) | — | 363 | — | — | — | — |
| strict, fully reduced | 134 of 134 | 102 / 0 (102) | 5 / 129 | 100 | 4.248476 | 3.978170 | 1 | no |
| replay, bisected | 45 of 134 | 102 / 89 (191) | 5 / 40 | 278 | 0.972042 | 0.910200 | 0 | yes |

The strict run ends `no-further-valid-reduction` after 338 candidates naming
`MQ_BOUNDARY_DEVIATION: 2.034193 against <= 1, removing source vertex 106`. The
bisection — lo 0, hi 134, choosing on `grid` — tries 67 (fail 1.933933), 33
(pass), 50 (fail), 41 (pass), 45 (pass 0.972042), 47 (fail), 46 (fail 1.220845)
and takes **45 in 7 replays**, the card's count. A walk of all 134 steps in one
comparison agrees: last pass 45, first fail 46, nothing passing after it, so
validity is monotone along the order here at bound 1. All five boundary
removals fall inside the first 45 steps. Boundary reduction 5 of 107, total
236 → 191 (−19.1 %), against the card's 1–2 and −29.5 % / −18.8 %.

**Controls under the same bounds** (every static row of `measureMeshQuality`
against the source hull, and the comparison above):

| control | boundary / interior (total) | selection / held out | min angle, min / P10 | how |
| --- | --- | --- | --- | --- |
| C0 | 107 / 3 (110) | 0.875000 / 0.819337 | 1.19° / 4.15° | the source's boundary, interior thinned greedily with motion in the loop (selection frames only) |
| C1 | 100 / 3 (103) | 0.867748 / 0.812549 | 1.49° / 4.69° | the fewest-vertex *subset* of the source hull holding every static row, same thinning |
| C2 | **74 / 3 (77)** | 0.875202 / 0.819531 | 3.55° / 5.28° | each hull vertex allowed 0, 0.5 or 0.9 px outward, fewest-vertex outline, same thinning |
| C3 | 74 / 28 (102) | 0.660991 / 0.618940 | 5.80° / 10.98° | C2's outline and every other grid column and row, no search |
| `MQ89`'s control | 107 / 28 (135) | 0.660991, every frame held out | — | the source's outline and every other grid column and row, no search |

Against the replay's 191, C2 holds 114 fewer vertices and C3 89 fewer, each
with a lower motion error, and **C0 keeps the source's boundary untouched and
drops 81**: on this fixture the interior is the larger part of what the
reduction leaves on the table. C0–C2 are existence proofs — the thinning poses
every trial, which `rig-c/mesh` never does (§0) — not proposed mechanisms.
There is no single winner: C2 is fewest and has the worst triangles (minimum
angle 3.5°, area P90 1,566 px², fans from three interior points to the rim); C3
has 25 more vertices and the best shape of any reduced mesh measured, minimum
angle above the source's own 5.0°. No static row sees the difference, because
the card declares no `minAngle`. `MQ89` holds the cheapest of these to build
— no boundary search — and reads the same motion error as C3: the worst frame
is set by the interior.

**Scale and smoothness.** At scale 1 and ripples 0, 0.8, 1.5 and 2.5 px, and at
scale 1.3 with ripple 0, the boundary survives every strict run (0–8 of 29–120
removed), each stop naming `MQ_BOUNDARY_DEVIATION`; the ripple sets *how many*
boundary vertices there are, not what pins them. The smooth variant at scale
1.3 is worse: 43 / 129, nothing removed from the boundary, and the bisection
takes step 2 of 129 (a 1.2 % reduction).

**A negative control.** On the smooth variant, a relocated outline thinned to
22 vertices passes every static row (deviation 0.990201, overshoot 2.828427)
and **fails motion at 1.917724 px with every interior vertex kept**: an outline
thinned to its silhouette minimum can break deformation, and the silhouette
bounds cannot see it. Which edge carries the error was not localised. The same
variant's removal-only subset (43 → 33) and 33 / 6 control pass.

### Measured — what holds the boundary [measured, #1271]

The four suspects the card names were separated with an instrumented copy of
`src/meshreduce.ts` that records, for every attempt, every required row and
not only the first named — its results byte-identical to `reduceMesh`'s on the
19 inputs recorded for stage D1 (on Nova) and on `MQ79`'s fixture (darwin).
Subjects: `MQ79`'s fixture, and demo/bottomwear with the other 8 public
example inputs of that record; none is private art.

| rank | what binds | `MQ79` (strict) | demo/bottomwear (strict, no region) |
| --- | --- | --- | --- |
| 1 | `MQ_BOUNDARY_DEVIATION ≤ 1`, measured against a hull that was itself simplified at 1 px | never alone; fails in 8 of 56 refusals (the corners); bound 2, 4 or ∞ alone: 28 → 28 kept | fails in **847 of 847** boundary refusals, alone in 602; bound 2: 282 → **91** kept; 4 or ∞: **82** |
| 2 | coverage 1 ⇔ undercut 0, overshoot ≤ 3 | **56 of 56** refusals; coverage 0 + undercut 1: 28 → **8** | beside rank 1 in 245, never alone; bind only once rank 1 is relaxed; relaxed alone: 282 → 282 |
| 3 | the replay cut | 0 boundary removals cut at the motion-accepted step 94 | at most 1 (the pass-2 removal at step 254) for any step in 10–253 |
| 4 | removal order | interior-first: the same 28, the same vertex set | interior-first: 282 |
| 5 | re-triangulation | 0 refusals under the strict policy | 0 refusals |

**The mechanism is two equal tolerances.** For one removal from the source,
the measured deviation equals the removed vertex's sagitta over its
neighbours' chord, to six decimals, in 293 of 293 hull vertices of
demo/bottomwear. That hull is a traced staircase simplified at about the same
1 px: sagitta P10 1.109, **P50 1.414** (the pixel diagonal), P90 2.157 px;
only **9 of 293** read ≤ 1, and 9 are what removes alone. Across the 9 example
inputs `MQ_BOUNDARY_DEVIATION` fails in every boundary refusal, relaxing the art
bounds alone moves no boundary count, interior-first order moves none, and
bound 2 removes 21–69 % of the hull with every art bound still holding on the
result. The synthetic inputs of the same record, whose hulls have sagittas
≤ 1, reduce their boundaries normally under the same bound. The order costs
work, not vertices: 847 of demo/bottomwear's 1,101 candidates (77 %) are
boundary retries that cannot pass, because neither the bound nor the
reference moves between passes.

On the reproducer, `MQ90` holds the counterfactual: the deviation bound at 2,
every art bound unchanged, leaves **52 of 107** boundary vertices (55 removed,
coverage 1, overshoot 3, undercut 0, accepted); `MQ86`'s plant with the bound
out of reach keeps 36 and stops on `MQ_OVERSHOOT`. A removal-only outline,
however ordered, can go from 107 only to 100 at bound 1 (C1); it is a
*joint* choice — on the smooth variant 43 → 33, where every single removal is
refused, because one chord replaces a run of staircase vertices — and
`reduceMesh` removes one vertex at a time.

**`MQ79` does not reproduce the boundary half.** It removes 24 of its 52
boundary vertices (46 %), and what keeps the rest is coverage 1 / undercut 0
over art that is exactly the hull's pixel centres — 48 of its hull vertices
have a sagitta ≤ 0.08 px. A public positive control for #1271 needs a traced
boundary simplified at the deviation bound's own tolerance; that is why §8 has
its own fixture.

**Triangulation decides motion.** `MQ79`'s strict result and the same
reduction run interior-first end on **the same 28 vertices** (source indices
listed in the record) and 26 triangles each, triangulated differently:

| triangulation of the 28 | edges | `MQ_LOCAL_DEFORMATION` (bound 1) |
| --- | --- | --- |
| the tree's order (ascending source index) | longest 118.8 px, a 112 px horizontal span across `b`'s pivot; P90 88.0 | **1.807703 — refused** (§7) |
| the same reduction run interior-first | longest 57.2 px | **0.244563 — accepted**, and every replay step 0–119 passes |
| a left-to-right zipper over the strict result's 28 (built in scratch) | P90 47.4 px | **0.245 — accepted**, every static row passing |

On this section's fixture the same holds for the replay: its 191 vertices
Delaunay-triangulated read **0.574257 / 0.537722** against the ear-clipped
0.972042 / 0.910200, and the fully reduced 102 / 0 drops from 4.248476 (one
inversion) to 1.647442 (none) — still refused. A walk of every accepted step,
each Delaunay-triangulated, passes as far as step 101 (102 / 33, 0.912243)
against 45 ear-clipped — but **is not monotone**: the first failure is step 60
and 36 steps between 62 and 101 pass after it, so a bisection over it would not
find 101.

⚠️ **Correction [measured, #1271].** The last clause is wrong: the bisection
rig-parts runs, read off the same walk, probed 67, 100, 117, 108, 104, 102, 101
and **found 101** (and 81 on the smooth variant), because its probes fell above
the non-monotone stretch. What holds is that it is **not guaranteed** to find
the last pass (*Measured — bounded alternatives*).

### Measured — spatial measurements of allocation [measured, #1271]

Each measured on six synthetic fixtures built to be accepted or flagged (one
domain, 160 × 52 px, two bones, art the hull's pixel centres, deviation
bound 1), on `MQ79` at every accepted step, and on the 8 public example inputs
that reduce. The bars are separations measured on those fixtures — the
geometric midpoint between the worst must-accept and the best must-flag
reading — not defaults rigc would set; each is proposed as an `undeclared`
diagnostic row first.

| measurement | what it reads | must-accept worst → bar → must-flag best | needs |
| --- | --- | --- | --- |
| **grade max** — max over edges of \|h_u − h_v\| / L, h = mean incident edge length | an uncontrolled transition, dense beside sparse, justified or not | 0.998 → **1.64** → 2.694 (×1.64 each side) | geometry |
| **minimum angle P10** | sliver fans off a dense boundary | 17.10° → **7.77°** → 3.53° (×2.2) | geometry |
| **allocation contrast Δ** — the share of the *dense* vertices removable alone, by a half-edge collapse judged against declared needs only, minus that share among the rest; economy **E** = the share of all | density no declared need explains, located | 0 → **0.25** → 0.510; holds for gradation G 0.5–1.64 (accept ≤ 0.124) | δ, mask, weights, gradation G, **a declared motion amplitude {θ, ε}** |
| **deformation load D** — max over edges of L · Δshare, px; D·θ/4 bounds the chord error of the mesh's own field | an edge too long for the weight change it spans | on `MQ79`, predicted / posed **1.002–1.091 over all 119 accepted steps**, Pearson 0.99999 — **and on `MQ79` only** (below) | weights; θ to read it in px |
| **B\*** — the fewest source-hull vertices a closed outline can keep with every static row held | boundary beyond what the silhouette needs | ear-clipped B\* outlines pass `measureMeshQuality` with the input's own targets on **9 of 9** inputs that reduce | δ, mask |

What they read: `MQ79`'s replay at step 94 flags on all three bars (grade
4.52, minimum angle P10 4.49°, Δ 0.357 — its 25 interior vertices are the
source's whole 8-px grid at x 120–152 and none at x < 120, the ascending-index
prefix); its source reads Δ 0.020, E 0.524 — uniformly over-dense, economy and
not allocation. `MQ79`'s strict result keeps exactly B\* = 28 boundary
vertices; the public example inputs keep **0–65 above B\*** (282 against 217
on demo/bottomwear). D·θ/4 reads 1.814 on the strict result (1.808 posed) and
0.249 on the zipper (0.245 posed). And the dense-boundary-beside-sparse-interior
pattern is already in every example **source**: boundary nearest-neighbour P50
3.2–5.1 px against interior 5–36 px, grade max above 1.64 on 7 of 8.

**Rejected, and why:** raw uniformity (the coefficient of variation of local
size) reads highest on a fixture that must *not* be flagged (0.609, against
0.416 on one that must) — it is the global uniformity the card rules out;
boundary-transition and longest/shortest-edge ratios read justified anisotropy
3.40 against an abrupt transition's 3.86; the minimum angle itself (rather
than P10) reads 10.49° against 10.43° across the pair it must separate;
deformation-load equidistribution reads the justified fixture 0 and the
unjustified 0.68 — backwards; an isotropic need-field ratio is undefined on
even meshes and backwards where defined; a collapse test whose transition
term is built from the mesh's own sizes justifies its own abruptness.

⚠️ **Nothing that reads justification separates without a declared
amplitude.** With no {θ, ε}, the dense-share reading is 0.920 on the even
positive control and 0.981 on the worst negative: such a row has to report
`not-measurable`, never a pass. Two fixtures with **identical** area and edge
percentiles (26 / 94.25 / 120.25 px², 4 / 13.60 / 20.62 px) and identical grade
(0.543) read Δ −0.941 and 0.510 — their density is justified on one weight
field and not on the other, and only the weights and the amplitude tell them
apart. The predictor D is validated on one fixture (two bones, one rotation, a
linear ramp); read under an assumed single θ on many-bone fields it is a
reading to compare against, not a motion row.

⚠️ **Correction [measured, #1271]: the predictor does not generalise.** On the
smooth fixture with flips, D·θ/4 against the posed row reads Pearson
0.00–0.69 and agrees on pass or fail at 24–55 of 130 steps; on sample/topwear's
fully reduced mesh it predicts 0.780 where the linear-blend stand-in reads
3.039 [assumed motion]. D bounds the chord error of the mesh's own weight
field; the comparison measures the difference to the source, which includes
§7 M2's lever term, invisible to D. `MQ79`'s source reads 0.012 against itself,
which is why it agrees there. D stays a location reading; it is not a motion
predictor, and no question below offers it as one.

### Implemented — the allocation rows [agreed, rig-parts#126; implemented, #1280]

parts answered Q2 and Q7 on rig-parts#126: all five measurements above are
reported, as `undeclared` rows, with no bound declared on any of them today;
the amplitude the two weight-aware ones read is an optional field of
`MeshMeasureInput` that parts fills from the motion it already declares. The
measurements are `src/meshallocation.ts`; `measureMeshQuality`
(`src/meshquality.ts`) turns them into rows of the geometry section of every
report it writes — and so of every `reduceMesh` result and every
`compareMeshesInMotion` setup section, which are its reports.

| Code | Value | Unit | `worst` | `not-measurable` when |
| --- | --- | --- | --- | --- |
| `MQ_GRADE` | grade max: the largest \|h_u − h_v\| / L over the mesh's unique edges, h a vertex's mean incident edge length | ratio | the edge (the first in sorted order on a tie) | an edge has zero length |
| `MQ_MIN_ANGLE_P10` | the tenth percentile of the triangles' smallest angles, nearest rank at round((n − 1) · 0.1), ties by triangle index; the angle is `MQ_MIN_ANGLE`'s formula | degrees | the triangle at that rank | never on a mesh `traceOutline` accepts |
| `MQ_ALLOCATION_CONTRAST` | Δ, as defined above; economy E and the counts both are taken from in `allocation.contrast` | fraction | the dense vertex with the lowest ν | `motionAmplitude` left out or `null`, its `gradation` left out or `null` (#1291), `source.weights` null, `targets.maxBoundaryDeviation` null, fewer art samples than `minArtSamples`, a refused region, a pair of bones no track declares, or an empty dense or rest class |
| `MQ_DEFORM_LOAD` | the largest L · Δshare · θ / 4 over the edges, px: the chord-error bound of the mesh's own weight field under the declared amplitude | px | the edge; `{ at: {} }` when no edge moves a share | `motionAmplitude` left out or `null`, `source.weights` null, or a pair of bones no track declares |
| `MQ_BOUNDARY_NECESSARY` | B\*, over the **reference hull**; the search's work in `allocation.search` | count | the first vertex of this mesh's hull, in walk order, that is not on the B\* outline; `{ at: {} }` when every one is | no `referenceHull`, `targets.maxBoundaryDeviation` null, or fewer art samples than `minArtSamples` |

Every row carries `allocation.reading`, one fixed sentence saying what the
value is a reading of; `MQ_DEFORM_LOAD`'s says it is **not predicted motion**
and no difference to any reference — §8's correction above. None has a field
to declare a bound in, so each is `undeclared` when measured: out of the pass
count, never required, never the constraint a step is refused on, never a
pass. The section's `summary` counts them like every other row.

**The amplitude.** `MeshMeasureInput.motionAmplitude?: MotionAmplitude | null`:

```ts
interface MotionAmplitude {
  tracks: Array<{
    track: string;                                         // echoed, never read
    pairs: Array<{ bones: [string, string]; theta: number }>; // θ = ‖M − I‖ of the pair's relative linear part
    epsilon: number;                                       // ε, drawing px, above 0
  }>;
  gradation: number;                                       // G, px per px, 0 or more — Δ only
}
```

Left out, it is not declared; `null` declares it absent (as a `null` art
bound is, #1257) — both leave `MQ_ALLOCATION_CONTRAST` and `MQ_DEFORM_LOAD`
`not-measurable` with a reason naming the field, and differ only in the
reason's words and in the echo: `EffectiveSettings.motionAmplitude` is written
when the input set the field, `null` included, and absent otherwise. Anything
else that is not a `MotionAmplitude` in full is refused
(`REDUCE_INPUT_MISSING`, naming the field's path). θ is dimensionless: 2 sin(α
/ 2) for a rotation by α (≈ α in radians for a small one), |s − 1| for a
uniform scale by s. A pair is unordered; declared twice, in one track or
several, the larger θ and the larger θ / ε are read. Across an edge the share
moves from the bones that lose it to the bones that gain it; every such pair
has to be declared — a pair no track declares makes both rows
`not-measurable`, naming the two bones and the edge, because no amplitude is
assumed (a bone that does not move is declared with θ 0). The edge's θ is the
largest over those pairs, which bounds |Σ Δw_b R_b| ≤ Δshare · max θ, so on a
two-bone field the reading is exactly §8's and on a many-bone field it is an
upper bound. The field declares no bound; it changes no other row.

⚠️ **One field more than the card named, and why.** Δ's need field relaxes at
a gradation G (the table above: "needs … gradation G"), and the stage-A
record left who declares G open. No default is invented, so G is
`motionAmplitude.gradation`, declared beside the amplitude it is read with;
only `MQ_ALLOCATION_CONTRAST` reads it. ⚠️ **Changed by [implemented,
#1291]:** the field stays the author's — nothing a rig declares fixes it,
measured in *G — what it derives from* below — but it is no longer required to
send the amplitude: `gradation?: number | null`, and left out or `null` it
leaves `MQ_ALLOCATION_CONTRAST` `not-measurable` naming it while
`MQ_DEFORM_LOAD`, which never read G, is measured.

**Readings the tree fixes that the stage-A record left open** — each measured:

- **B\* is read against `referenceHull`** — the source hull a `reduceMesh`
  result is held to — so a reduction's report reads the source's B\* beside
  the result's `counts.boundaryVertices`, the comparison this section makes.
  `reduceMesh` measures every step against the same source hull, so B\* is
  computed **once per call** (memoised on the call's art rasters, keyed by the
  hull's coordinates and δ). The chord-to-run half of a skip is exact (the
  branch and bound `directedHausdorff` uses, to `1e-9` px) where the
  prototype sampled every 0.25 px; and the outline is at least three
  vertices. The search tests every forward skip of two or more from every
  hull vertex once: **at most n × (n − 2) shortcut tests** for an n-vertex
  hull, which `allocation.search` reports beside the count (`MQ125` holds
  tests ≤ bound). On the recorded inputs B\* is the prototype's on all 7
  (217, 14, 95, 162, 21, 166, 59).
- **Δ's dense class reads local size on the `r6` grid**, so which vertices are
  "below the median" is not decided by a summation order. ⚠️ **Correction
  [measured, #1280]** to the stage-A record's consumer readings of Δ (not to
  this section's fixtures, which read identically): those were taken on
  points rebuilt from UVs, up to 4·10⁻⁵ px from `points`, and on a lattice
  source that is enough to move vertices across the median. On `points`
  [assumed amplitude: θ = 5° between every pair, ε = 1, G = 0.75, as the
  record assumed]: sample/neck **−0.214** (UV-rebuilt 0.354), sample/topwear
  −0.514 (−0.090), sample/bottomwear −0.047 (−0.008), demo/bottomwear −0.351
  (−0.383; the record printed −0.378); E is the same number both ways on all
  four. So on lattice-sampled sources Δ is decided by ties at the median and
  moves with a sub-pixel perturbation of the points — read it there as the
  location of the removable vertices (its `worst`) and E, not as a signed
  figure.
- **`MQ_DEFORM_LOAD` reports D · θ / 4 in px**, not D: the card makes the row
  `not-measurable` without an amplitude, and with one the per-pair θ is part
  of which edge is worst.

**On a reduction.** `MeshReductionInput` has no `motionAmplitude` and this
change adds none, so on every `reduceMesh` report Δ and the load are
`not-measurable`, naming the field; B\*, grade and P10 are measured. A caller
that wants them measures the returned mesh with `measureMeshQuality` and its
amplitude. ⚠️ **Changed by [implemented, #1287]:** `MeshReductionInput` now
carries the field, into the result's own measurement, so a caller that
declares it reads both rows on the reduction's report — the same rows that
second measurement reads (`MQ106`); without it they stay `not-measurable` as
written here (*Stage B — the amplitude on a reduction*).

**Fixtures [implemented, #1280].** `MQ120` rebuilds the six fixtures above in
the suite and reads every figure of their table to the printed precision —
grade 0.998 → 2.694, P10 17.10° → 3.53°, Δ 0.000 → 0.510, at gradation 0.5,
1.0 and 1.64 (accept ≤ 0.124) — and B\* reads 4 on the four rectangle
outlines and 57 of 72 on the two wavy ones (`MQ125`). The reproducer's strict
run keeps exactly B\* = 28 boundary vertices, read off its own report.

**The opt-out [measured, #1280].** Every report a caller already writes is
the same bytes but for the five rows: with them taken out and each summary
recounted, the text is identical. On the inputs recorded for stage D1 —
demo/* and sample/*, 7 inputs (`demo__bottomwear`, `demo__neck`,
`sample__bottomwear`, `sample__hair_back`, `sample__neck`, `sample__sleeves`,
`sample__topwear`), each reduced and measured admission-shaped and
final-shaped on the source and the result — **34 of 34 texts identical**,
every returned mesh identical; darwin, Apple M4, against the tree this
change starts from (`6dcda87`). In suite, `MQ124` holds it on ten public subjects.

**Cost [measured, #1280].** Each row on its own, Nova pool (WSL2, Bun 1.4.2,
load 2.7), best of 5 (B\* and Δ best of 1), Δ and the load under the assumed
amplitude above:

| input | V / hull | grade | P10 | load | B\* (tests) | Δ |
| --- | --- | --- | --- | --- | --- | --- |
| demo/bottomwear source | 536 / 293 | 0.59 ms | 0.12 ms | 2.56 ms | 92.4 ms (85,263) | 244.2 ms |
| demo/bottomwear result | 282 / 282 | 0.14 ms | 0.06 ms | 0.50 ms | 53.6 ms | 20.5 ms |
| sample/sleeves source | 231 / 198 | 0.07 ms | 0.02 ms | 0.40 ms | 15.5 ms (38,808) | 31.0 ms |
| sample/bottomwear source | 230 / 107 | 0.10 ms | 0.02 ms | 0.52 ms | 2.9 ms (11,235) | 60.2 ms |
| sample/topwear source | 142 / 66 | 0.05 ms | 0.02 ms | 0.16 ms | 1.6 ms (4,224) | 22.4 ms |
| sample/neck source | 107 / 26 | 0.04 ms | 0.01 ms | 0.14 ms | 0.1 ms (624) | 16.0 ms |
| demo/neck source | 89 / 14 | 0.04 ms | 0.01 ms | 0.12 ms | 0.0 ms (168) | 12.9 ms |

`reduceMesh` reads grade and P10 at every measurement and B\* once:
`reduceMesh` before and after, in one process, alternating, best of 5, same
pool job (load 3.9–4.7) — demo/bottomwear 3,038 → 3,180 ms (+4.7 %),
sample/sleeves 2,282 → 2,340 (+2.6 %), sample/bottomwear 725 → 742 (+2.3 %),
sample/topwear 239 → 259 (+8.1 %), sample/neck 58 → 66 (+14 %), demo/neck
29 → 39 ms (+10 ms).

**Controls [implemented, #1280]**, in `mesh-quality`, numbered from `MQ120`
to stay clear of codes another change was opening in `mesh-compare`:
`MQ120` (the fixtures' separations; plant: the deformation need dropped),
`MQ121` (grade, P10 and the load against the suite's own derivation; plants:
grade undivided by L, P10 read as the minimum, θ dropped), `MQ122`
(`not-measurable` without the amplitude, the weights, the deviation bound, the
reference hull, or for an undeclared pair, each naming it; plants: the
rejected reading measured without an amplitude, an undeclared pair read as
rigid), `MQ123` (no row required: verdict, acceptance and pass/fail counts
those of the report without the rows, on eight subjects and the reduction;
plant: the rows required), `MQ124` (the opt-out identity; plant: a
measurement that rewrites its input's triangles), `MQ125` (B\*'s outline
holds coverage, undercut and deviation, the search under its bound, the
reproducer keeps B\*; plant: B\* without the art test), `MQ126` (one input,
one text, in any key order of the amplitude) and `MQ127` (refusals). Each
plant is an `AllocationPlant` passed through the internal
`measureMeshQualityPlanted`; `measureMeshQuality` plants none. `MQ126`'s
claim was seen to fail by hand with an echo that passed the input object
through.

**What the brief or the card said that the tree does not.** There is no
`residuals` section in `mesh-quality-report/1`: the rows are geometry rows,
as every other `undeclared` row is. AUTHORING.md has no row table — §4 is
the row table — so it does not change. "Region-normalised where §8 says so":
§8 normalises none of the five by a region's density (the stage-A record kept
that ratio as a diagnostic, not a row); regions enter Δ as declared needs, L0
inside and L0 + grade · d in the band, through `regionEdgeBound` — the bound
`MQ_MAX_EDGE` and `MQ_TRANSITION` read.

### Measured — bounded alternatives [measured, #1271]

Each alternative was a switch in a scratch copy of `src/meshreduce.ts` (the
instrumented copy above plus the switches); with every switch off it returned
the tree's result byte for byte on all 9 subjects. Subjects: this section's
fixture (primary, and its smooth variant), `MQ79`'s, and six public example
inputs recorded for stage D1 (demo/neck, demo/bottomwear, sample/neck,
sample/topwear, sample/bottomwear, sample/sleeves). The two fixtures and
`MQ79` were posed by `compareMeshesInMotion` (`grid` selection, `irr` held
out, bound 1, no inversion). The example inputs have no public rig, so they
were read through a scratch linear-blend stand-in **[assumed]**: every bone
pivots at the share-weighted centroid of the vertices it carries, with no
hierarchy, and turns ±5° alone. Where pivots and hierarchy are known it
matched the posed comparison to 1.0000 on `MQ79` and on the primary fixture.
Its figures are a common yardstick between variants, not a verdict on any
rig-parts attachment; D2 is where those are posed. Runs: darwin (Apple M4,
load 5.2–14.1) and three Nova pool jobs (WSL2, load 1.2–4.4).

| rank | mechanism | primary fixture, replayed (posed): total (b/i), selection / held out | demo/bottomwear, replayed [assumed motion] | cost | contract change |
| --- | --- | --- | --- | --- | --- |
| baseline | the tree | 191 (102/89), 0.972 / 0.910 | 526 (283/243), 0.450 / 0.488 | — | — |
| 1 | **Delaunay flip post-pass** on every returned mesh, vertex set kept | **135 (102/33), 0.912 / 0.854** | 526 — no change | +0–5 % time, no extra candidates | the triangulation becomes the operation's own, so output bytes differ: opt-in only |
| 2 | **boundary runs as steps**: up to 8 consecutive outline vertices removed as one accepted step, before the interior, every bound as declared | 189 (100/89); with rank 1, 133 (100/33) | **488 (245/243)**, 0.700 / 0.670; with rank 1, **470 (227/243)** | ×6–10 time, candidates 1,101 → 4,804 on demo/bottomwear | one accepted step removes 2 or more vertices, so `acceptedAt.length = insertedVertices + removedVertices` no longer holds |
| 3 | **error-priority order** (`dprio`: each pass sorts candidates by the smallest L·½‖Δw‖₁ over the edges the removal adds) | 140 (102/38), 0.655 / 0.614; with rank 1, **110 (102/8)** | 525 (284/241) | +0–15 % time | none in the format; a different step sequence |
| 4 | **relocation plus weight transfer** (a relocated outline as step 0, then the tree's passes) | 163 (74/89); with rank 1, 107 (74/33) | **refused at step 0**, 3.477 / 2.865 | +0.05–1.6 s search | P19, a deform refusal, the UV window, the meaning of step 0 |

What each did:

- **The flip post-pass decides the interior.** On `MQ79` it turns the fully
  reduced 28/0 from refused at 1.807703 into accepted at **0.2446 / 0.2290**,
  28 vertices where the replay keeps 53; on the smooth fixture the replay goes
  170 → 91; under the stand-in sample/neck 57 → 26 and sample/topwear
  121 → 80. It does nothing on demo/bottomwear (526): a 282-vertex outline over
  an eleven-bone field needs long diagonals whatever the triangulation, so the
  interior has to stay and the replay has to choose it. Whether the flips run
  once on the returned mesh or after every removal is moot for Delaunay: the
  two gave identical figures on 8 of 9 subjects (`MQ79` differs by a
  cocircular tie), the in-loop form costing up to 35 % more.
- **Boundary runs are the only mechanism that moved the consumer-like boundary
  at the 1 px bound as declared.** Fully reduced: demo/bottomwear 282 → **225**
  against B\* 217, sample/sleeves 190 → **168** (B\* 166), sample/bottomwear
  101 → 95, sample/topwear 63 → 59, sample/neck 26 → 21; on the two fixtures
  102 → 100 and 43 → 33, each the removal-only optimum. Because the runs are
  steps before the interior, a replay keeps them.
- **A boundary simplified as one pre-step is refused by motion.** The same
  outline taken whole at step 0 (the B\* subset) reads **3.081 / 2.865 px** on
  demo/bottomwear and 1.813 / 1.815 on sample/bottomwear [assumed motion],
  refused, where the runs replay to 245 and 96 within 1 px. A replay cannot step
  back into a pre-step, so boundary simplification has to be steps, and the
  replay decides how far it goes.
- **Error-priority order** helps the two fixtures and sample/topwear
  (121 → 86) and is monotone wherever it was posed, does nothing on
  demo/bottomwear (526 → 525) and costs vertices on sample/sleeves (209 → 223,
  at lower error). Interior-first and sagitta orders gain nothing outside
  `MQ79`.
- **Relocation** reaches A1's C2 and C3 under a defined weight transfer —
  barycentric inside a source triangle, from the nearest point of the source
  hull outside it, then §6's insertion rule: 0.876213 / 0.820477 and
  0.660991 / 0.618940 — and the largest savings where it holds (`MQ79` 12
  vertices with flips). But it is **refused by motion at step 0 on 4 of 9
  subjects** (the smooth fixture 1.927 px, demo/bottomwear, sample/bottomwear,
  sample/sleeves), and its first `MQ79` run was refused at admission with
  `REDUCE_UV_RANGE` — an outward move left the texture window, which no
  silhouette row reads. Not recommended for Stage B on this evidence.
- **Rejected:** flips by the deformation-load criterion in global form, which
  rewrite the source's own triangles (step 0 reads up to 2.709 px on
  demo/bottomwear); a hole-local form was not built.

**What needs which contract change.** None of ranks 1–3 needs the deviation
bound redefined or a motion amplitude declared; each needs a byte-identical
opt-out.

| contract item | flip post-pass | boundary runs | error-priority order | relocation |
| --- | --- | --- | --- | --- |
| the returned triangulation is the operation's (§1, §3) | **yes, opt-in** | — | — | with flips |
| `acceptedAt` counts operations, not vertices | — | **yes** | — | step 0 |
| P19 attributes kept; a deform refusal for a moved vertex | — | — | — | **yes** |
| the UV window bounds the search | — | — | — | **yes** |
| `stopAfterAccepted: 0` is the source | yes (the source, flipped) | yes | yes | **no — the relocated source** |

**Replay and monotonicity.** Every probed `stopAfterAccepted: k` returned the
walk's snapshot byte for byte under every variant (9 of 9 probes per variant on
the fixtures and `MQ79`, 1–8 per example input); a second run was identical,
and the primary fixture's hashes were equal on darwin arm64 and WSL x86_64.
The post-pass keeps replay byte-exact by construction too: the removal loop is
unchanged, so the state at step k is the tree's, and the flip is a
deterministic function of that state. **Monotonicity is not guaranteed under
it**: the Delaunay walk's first failure / last pass / passes after the first
failure read 60 / 101 / 36 on the primary fixture, 25 / 81 / 50 on the smooth
one and 57 / 62 / 5 on sample/topwear. The bisection rig-parts runs found the
last pass on all three (101, 81, 62) because no probe fell in the stretch —
which is luck of placement, not a property.

**Trade-off, not a universal minimum.** Fewest vertices and triangle shape
conflict on the two fixtures: on the primary one every reduction below 110
vertices has minimum-angle P10 2.2–3.1°, against 4.8° at 110, 7.2° at 135 and
10.8° at 191 — and the bar above (P10 ≥ 7.77°) flags 135 at 7.16°. On `MQ79`
and demo/bottomwear the fewest-vertex result found is also the best-shaped. No
mechanism here is claimed as the minimum.

### Questions for parts

Numbered afresh for #1271; cited as "§8 Q1" and so on where §7's could be meant. Each
comes from a measurement above; none is settled by this page.

- **Q1.** The boundary is held by two equal tolerances: an outline simplified
  at 1 px and a deviation bound of 1 px measured against that outline. Which of
  these, if any, does parts want — each loosens something different:
  (i) parts declares `maxBoundaryDeviation` as its sampling tolerance plus an
  allowance (on the reproducer bound 2 keeps 52 of 107 with every art bound
  held; on demo/bottomwear 91 of 293) — loosens the declared silhouette limit,
  which the card lists among the limits not to loosen; (ii) parts samples the
  hull finer than the bound it declares — loosens nothing declared, and moves
  the reference with the sampling, so it buys removability only where the art
  allows; (iii) P13 is reopened so the bound reads against the traced art
  outline rather than the source hull — loosens the agreed meaning of a
  required row, and every recorded result's verdict would have to be re-taken;
  (iv) a boundary simplification step in `rig-c/mesh` that chooses an outline
  jointly (one chord for a run of vertices) held to the art bounds and the
  declared deviation — loosens no bound, adds an operation whose removals are
  not one vertex at a time. Option (iv) as boundary runs taken as steps moved
  demo/bottomwear's fully reduced boundary 282 → 225 at the 1 px bound as
  declared (*Measured — bounded alternatives*; its contract change is Q10).
- **Q2.** The allocation and load readings need a declared amplitude: θ per
  pair of bones a share moves between, and ε. Who declares it — parts from the
  motion it already declares, or the consumer per attachment — and does it
  belong in `MeshMeasureInput` as an optional field? Without it those rows
  report `not-measurable`. [agreed, rig-parts#126] parts, from the motion it
  already declares, in an optional field of `MeshMeasureInput`;
  [implemented, #1280] as `motionAmplitude` (*Implemented — the allocation
  rows*).
- **Q3.** On `MQ79` and on this fixture a different triangulation of the same
  vertex set is what passes motion. Is a post-pass that keeps the vertex set and
  re-triangulates acceptable, given that it changes the bytes of every result
  it touches — and if so, opt-in only, so today's calls stay byte-identical?
- **Q4.** The bisection rig-parts runs over `acceptedAt` assumes passing is
  monotone in the step. Ear-clipped it was on both fixtures at bound 1; with the
  Delaunay post-pass it is not guaranteed (first failure / last pass / passes
  after it: 60 / 101 / 36, 25 / 81 / 50, 57 / 62 / 5), though the bisection
  found the last pass on all three. If a triangulation pass ships, does
  rig-parts need monotonicity kept, or will it accept the disclosed
  non-monotone stretch and walk or search differently where it matters?
  ⚠️ **Correction [agreed, rig-parts#126]:** the question's premise is wrong —
  rig-parts's search reports a passing prefix found by bisection, not
  necessarily the last, no monotonicity is promised by either side, and the
  chosen step is re-compared on the whole schedule before anything is written.
  **Seen on a real part [observed, rig-parts PR #147]:** in rig-parts's rerun
  at rig-c 2.28.0, sample/sleeves under `boundaryRuns` alone wrote **223**
  vertices against the baseline's 192, because the bisection found a passing
  step 3 of 50, not the last — the non-monotone case §7 M3 and this question
  disclosed, on an ear-clipped replay with the runs as steps rather than on the
  Delaunay walk measured above; with all three opt-ins the part writes fewer
  than its baseline (*Stage B — rig-parts's rerun* at the end of this section).
- **Q5.** Is relocation wanted at all? The fewest-vertex controls (C2, C3) need
  positions not in the source, which breaks the index correspondence a
  `vertices` deform key relies on (§6, P18), needs a weight-transfer rule (the
  controls carried the source vertex's weights over a move of at most 0.9 px,
  exact only because the field there depends on x alone), and moves UVs off
  the source's.
- **Q6.** The smooth negative control shows an outline thinned to its
  silhouette minimum failing motion (1.92 px) with every interior vertex kept.
  Should a boundary operation (Q1 iv) be held to the motion comparison by
  rig-parts before acceptance, as every reduction is today, rather than
  guarded inside the operation? The measurements favour the comparison: the
  boundary runs leave the motion to the replay, a pre-step the replay cannot
  undo was refused, and the deformation load D is not a validated motion guard
  beyond `MQ79` (*Measured — spatial measurements of allocation*, correction).
- **Q7.** Of the measurements proposed as `undeclared` rows — grade max,
  minimum angle P10, allocation contrast Δ with economy E, deformation load D,
  B\* — which does parts want reported, and does it want to declare a bound on
  any of them, given the bars above come from one synthetic domain? D would be
  reported as a location reading only, never as predicted motion.
  [agreed, rig-parts#126] all five, `undeclared`, and no bound on any of them
  today; [implemented, #1280].
- **Q8.** On the two private attachments, in aggregate figures only: the
  sagitta distribution of the source hull (P10/P50/P90 and the count ≤ the
  declared deviation), and B\* against the kept boundary — whether the boundary
  half there is the same two-tolerance mechanism.
- **Q9.** Does rig-parts accept that the returned triangulation becomes the
  operation's own — the Delaunay post-pass, opt-in, the opt-out path
  byte-identical, replay byte-exact — with the non-monotone interval of Q4
  disclosed rather than prevented?
- **Q10.** May `acceptedAt` become one entry per accepted operation rather than
  per vertex, so that one step can remove a run of boundary vertices? What does
  rig-parts's reader of `acceptedAt` and `stopAfterAccepted` need for that —
  the vertices each step removed, or only the count per step — and is the
  prototype's ×6–10 cost acceptable while it is brought down?
- **Q11.** Is a weight-aware removal order such as `dprio` rig-c's — a pose-free
  default inside `rig-c/mesh`, behind an opt-in — or rig-parts's policy, passed
  in as an order? It reads weights only, and its ranking assumes every share
  change bends equally.

### Stage B — boundary runs as steps, and `acceptedAt` per operation [implemented, #1279]

**Decided** [agreed, rig-parts#126, its answers to the questions above]: Q1 —
option (iv), boundary runs taken as steps inside `rig-c/mesh`, under the
declared bounds and P13's reference meaning ((ii) is parts's own experiment;
(i) and (iii) refused); Q6 — a run stays replayable and is held to parts's
final motion comparison like every step, and no pre-step the replay cannot
back out of; Q10 — `acceptedAt` counts operations, recording each one's kind
and count, the prototype's cost accepted while it is brought down, absolute
runtime and candidates reported; Q4 — nothing here promises that passing is
monotone along the steps.

⚠️ **Correction to Q1 [agreed, rig-parts#126]:** the answer recorded above
read "(ii) is parts's own experiment", from parts's first reply, which put
option (ii) first and gave it before the trial ran. The trial refuted it, and
parts withdrew (ii) on its own measurement (rig-parts PR #146, rig-c 2.24.1):
with every declared bound unchanged and the source hull sampled at tolerance
0.5 and 0.25 on its eight parts, 84–100 % of hull vertices then sit at or under
1 px, yet every reduction still stops on `MQ_BOUNDARY_DEVIATION`, and the parts
the motion comparison refused get **worse** — a finer source has more
accepted steps and the bisection lands earlier (sample/sleeves 190 + 2 →
665 + 33 vertices at 0.5; demo/bottomwear 283 + 132 → 379 + 99), and at 0.25
demo/bottomwear is refused outright, its unreduced source failing
`MQ_INVERSION` against itself (one triangle, at `idle@grid@2.583333`), so no
search runs. So Q1's answer is **option (iv) alone** — boundary runs taken as
steps inside `rig-c/mesh`, held to the art bounds and the declared deviation,
judged by parts's motion comparison before acceptance (Q6) — with (i) and
(iii) refused as before. Those figures are parts's, posted on rig-parts#126;
none was re-measured here.

```ts
/** src/meshquality.ts — the input's one new field; AcceptedOperation is in §2. */
export interface MeshReductionInput {
  // …every existing field…
  /** Opt-in. Left out = no run is tried. */
  boundaryRuns?: { maxVertices: number }; // a whole number, 2 or more; no default
}
```

- **What a run is.** A run is 2 to `maxVertices` consecutive outline vertices,
  every one a surviving, unprotected *source-hull* vertex (inserted vertices and
  interior vertices the outline has reached are never in one), removed one
  after another by the same `removalOf` a single removal uses and replaced on
  the outline by the chord from the vertex before it to the vertex after it;
  nothing is measured in between. It never leaves fewer than three outline
  vertices.
- **Held exactly as a single removal is.** After the run: every structural
  condition (each hole simple and ear-clipped, the outline one loop, every
  protected edge still an edge, `weightJump` over the edges the run added),
  then every required row of `measureMeshQuality` — the art rows,
  `MQ_BOUNDARY_DEVIATION` against the source hull at the declared bound,
  `minAngle` when declared, each region's rows. A refusal is named like any
  other, `<row>, removing source vertices a, b, c as one boundary run`.
- **Order, which is the determinism (A18).** Each removal pass, with the field
  set, first sweeps the runs and then the single removals exactly as without
  it. The runs: for each surviving, unprotected source-hull vertex in ascending
  source index, the runs starting there and following the outline the way the
  source hull is listed (the canonical walk), longest first — `maxVertices`
  down to 2 — the first one taken ending that start, the sweep going on to the
  next index over the outline the run left. A pass that takes nothing in either
  sweep ends the reduction.
- **Budget and replay.** Every run tried is one candidate. Each run taken is
  one `acceptedAt` entry, `kind: 'boundary-run'`, `count` ≥ 2,
  `sourceVertices` in outline order; `stopAfterAccepted` counts operations and
  its termination and promise are §7's.
- **Bounded work on the boundary path.** From the order above: a pass tries,
  for each of its *h* surviving, unprotected source-hull vertices, at most
  `min(maxVertices, W − 3) − 1` runs, where *W* is the outline's vertex count
  at that start (one per length from that down to 2) — so at most
  *h* · (`maxVertices` − 1) run candidates per pass, before its single
  removals. A pass that continues has taken at least one operation, each of
  which removes at least one source vertex, so there are at most one more
  passes than removable vertices; and every candidate, run or single, counts
  against `budget.maxCandidates`, which bounds the whole call. The absolute
  runtimes and candidates measured on the recorded inputs are the table
  below.
- **Opt-out.** A call without the field tries no run, and its mesh and report
  are 2.24.0's byte for byte with `acceptedAt`'s entries read as their `step`
  (measured below).

**A cost change that moves no byte: the deviation floor.** §8 *What holds the
boundary* found 847 of demo/bottomwear's 1,101 candidates to be boundary
removals the deviation row refuses, each paid in full. `MQ_BOUNDARY_DEVIATION`
is the symmetric Hausdorff distance between the candidate's outline and the
source hull, and its backward half evaluates every source-hull vertex's
distance to that outline exactly, so the row is at least the distance of any
removed source-hull vertex from the candidate's outline (`deviationFloor`,
`src/meshreduce.ts`). A candidate whose floor is over the bound by more than
`FLOOR_MARGIN` (ten units of the `r6` grid) is refused without the
measurement, after every structural check. The refusal's name is never
guessed: when it is read — the termination's last block, or a control's
observer — the candidate is measured in full and named by the rows, in the
same state (a pass that took nothing left the mesh unchanged). Singles and
runs alike; it is not part of the opt-in.

**Measured** [measured, #1279] — the tree at `6dcda87` (v2.24.1) against this
one, the 18 inputs of the stage-D1 record at 2.20.0 (`reduceMeshWith` over the
recorded input, one process per variant, darwin, Apple M4, 1-minute load
3.8–4.7, one run each — the times are one machine's, the candidates are not):

- **Opt-out bytes.** Mesh and report identical with `acceptedAt` read as its
  `step` numbers, **18 of 18**; and identical with the floor and with every
  candidate measured (`measure-every-candidate`), **18 of 18** opted out and
  **18 of 18** with `boundaryRuns: { maxVertices: 8 }`.
- **Replay across runs.** `stopAfterAccepted` at the first operations, the
  first boundary runs and the operation after each, the middle and the last
  equals the budget cut at that operation's `step`, with its termination and the
  run's first *k* entries, **26 of 26** probes over sample/neck, sample/topwear,
  sample/bottomwear, sample/sleeves and demo/bottomwear.

| input | source hull | 2.24.1: kept / candidates / ms | opted out: kept / candidates / ms | `maxVertices: 8`: kept (runs / vertices) / candidates / ms | the same, every candidate measured: ms |
| --- | --- | --- | --- | --- | --- |
| demo/bottomwear | 293 | 282 / 1,101 / 2,417 | 282 / 1,101 / **862** | **223** (27 / 65) / 4,029 / 3,126 | 11,633 |
| demo/neck | 14 | 14 / 103 / 22 | 14 / 103 / 17 | 14 (0) / 299 / 24 | 51 |
| sample/bottomwear | 107 | 101 / 331 / 526 | 101 / 331 / 182 | **95** (3 / 8) / 1,694 / 550 | 3,638 |
| sample/neck | 26 | 26 / 133 / 39 | 26 / 133 / 20 | **21** (2 / 5) / 430 / 41 | 135 |
| sample/sleeves | 198 | 190 / 421 / 1,458 | 190 / 421 / 152 | **166** (12 / 27) / 2,810 / 930 | 12,262 |
| sample/topwear | 66 | 63 / 205 / 218 | 63 / 205 / 59 | **59** (1 / 6) / 1,031 / 183 | 1,204 |

(sample/hair_back is `invalid-input` at admission in every variant.) Kept is
the result's boundary. Against *Measured — bounded alternatives*: the
prototype kept 225 / 95 / 21 / 168 / 59 on the same five that reduce; this
order keeps 223 / 95 / 21 / **166** / 59 — sample/sleeves at its B\* (166),
demo/bottomwear 6 above its B\* (217). Its cost: candidates ×2.9–6.7 against
2.24.1, time ×0.6–1.3 on these inputs (demo/bottomwear 2,417 → 3,126 ms,
sample/sleeves 1,458 → 930; the prototype measured ×6–10), because the floor
decides most run candidates without a measurement — without it the same runs
cost ×2.3–8.4 against 2.24.1 (11,633 ms on demo/bottomwear). The inputs under
50 ms are within the load's noise. On the public fixture the run keeps **100** of 107 against
the singles' 102, the removal-only optimum C1 (`MQ92`).

**Not done here.** A run is removal-only, so P19, the deform remap and the
UV window hold as for any removal; nothing in this landing touches the
triangulation (Q3/Q9) or the order of the single removals (Q11). Whether a run
passes motion is parts's comparison to decide (Q6), on the replay.

### Stage B — triangulation post-pass and weight-aware order [implemented, #1283]

**Decided** [agreed, rig-parts#126, its answers to the questions above]: Q3 —
a post-pass that keeps the vertex set and re-triangulates is acceptable, opt-in
only, so a call without it stays byte-identical; Q9 — the returned
triangulation becomes the operation's own under that opt-in, with the replay
byte-exact and the non-monotone interval disclosed rather than prevented; Q4 —
neither side promises that passing is monotone along the steps: rig-parts's
search reports a passing prefix found by bisection, not necessarily the last,
and re-compares the chosen step on the whole schedule; Q11 — the weight-aware
order is rig-c's, pose-free, inside `rig-c/mesh` behind an opt-in.

```ts
/** src/meshquality.ts — the input's two new fields; Retriangulation is in §2. */
export interface MeshReductionInput {
  // …every existing field…
  /** Opt-in. Left out = the triangles the removals leave. */
  retriangulate?: 'delaunay';
  /** Opt-in. Left out = single removals in ascending source index. */
  removalOrder?: 'deformation-load';
}
```

Each field has one value. `undefined` is the field left out; `null`, another
spelling or any other type is refused `REDUCE_INPUT_MISSING` naming the field,
as `stopAfterAccepted` and `boundaryRuns` are (`MQ104`). Each is echoed in
`effective` only when set.

- **The post-pass.** Once the reduction has ended — any termination that
  returns a mesh, a replay's included — the kept vertices are re-triangulated
  by Lawson edge flips toward the Delaunay triangulation (`delaunayFlips`,
  `src/meshreduce.ts`). No vertex is added, moved or removed, so `indexMap`,
  the canonical order, the weights and the deform remap are the removals'. A
  sweep visits every interior edge in ascending (smaller id, larger id) and
  flips it when the quad it closes is strictly convex, the two opposite angles
  sum past π (read as sin(α + β) < −10⁻⁹ from cross and dot products — no libm
  call), the edge is not protected (`protect.edges` and every source edge over
  `protect.weightJump`), no declared region holds it or would hold the new
  edge (`edgeIsHeldByRegion`), and the new edge is a source edge or within
  `protect.weightJump`. An outline edge has one triangle and is never visited.
- **Taken whole, or refused whole.** The pass's result is canonicalised and
  measured against the call's targets exactly as a result is; it is taken only
  when every required row passes, and otherwise the mesh is returned as the
  removals left it, with `changes.retriangulation.refusedBy` naming the first
  failing row. Whole rather than flip by flip, because the rows a flip can
  move are few and the pass already keeps them: the art rows and
  `MQ_BOUNDARY_DEVIATION` read the outline and the union of the triangles,
  which a flip inside a convex quad does not change; a region's rows read only
  the edges it holds, which the pass never flips nor makes (`MQ102`); and a
  Delaunay flip only raises the smaller angle of its pair. A measurement per
  flip would cost one per flip — up to n(n − 1)/2 — and buy nothing a row can
  see; the whole pass costs one. On a result that already fails a required
  row — a refined source that cannot meet its targets — the pass is refused
  naming that row (one input of the stage-D1 record, below).
- **Not a step.** The pass tries no candidate, is not counted in
  `budget.maxCandidates` and writes no `acceptedAt` entry. That is what keeps
  the replay byte-exact: `stopAfterAccepted: k` and the budget cut at
  `acceptedAt[k − 1].step` end on the same state, and both are followed by
  the same deterministic pass (`MQ99`). The removal loop never reads the
  pass, so `acceptedAt` and the termination are the call's without it.
- **Bounded work on the post-pass path.** Every flip the criterion allows
  lowers the triangulation's lifting onto the paraboloid strictly, so an edge
  flipped away never returns: at most n(n − 1)/2 flips over the n kept
  vertices; a sweep that continues has flipped at least one, so at most one
  more sweeps than flips, each visiting at most 3n interior edges; then one
  measurement. The flip bound is also held by count — reaching it refuses the
  pass naming the bound, which the criterion makes unreachable.
- **The weight-aware order.** With `removalOrder: 'deformation-load'`, each
  pass ranks its single-removal candidates once, after that pass's boundary
  runs (which keep #1279's order): the predicted load of removing a vertex is
  the largest L · Δshare over the edges its re-triangulated hole adds — L the
  edge's length in px, Δshare half the L1 difference of its ends' weight
  vectors (§8's deformation load) — 0 when the hole adds none, and a removal
  `removalOf` cannot make ranks last. Ascending load, ties by source index.
  Every attempt is still a candidate counted against the budget, held to every
  row exactly as before; only the order moves. On an unweighted source every
  load is 0 and the order is the default's.
  ⚠️ **Rejected:** the card's wording "over the removed vertex's incident
  edges". §8 defines `dprio` over the edges the removal *adds*, and every
  stage-A figure for it was measured that way; the incident edges are the ones
  the removal takes away, so they rank what is lost rather than the load the
  result carries.
- **Bounded work on the order path.** Per pass: one `removalOf` per surviving,
  unprotected source vertex (each a scan of the triangles) and one sort of
  those *c* candidates, O(*c* log *c*) comparisons; nothing is measured for
  the ranking and it tries no candidate. Passes are bounded as before — one
  more than the removable vertices — and the budget bounds the call.
- **The report.** With `retriangulate`, `changes` ends in `retriangulation`
  (§2): `method`, `taken`, `flips`, `sweeps`, `refusedBy` and `monotonicity`,
  the sentence that monotone validity along `acceptedAt` is not promised — a
  step that passes a comparison may be followed by one that fails and then by
  one that passes again, and a bisection finds a passing step, not necessarily
  the last. It is a field and not a row: it measures nothing, and a row with
  no value would read as a measurement. `removalOrder` is echoed in
  `effective`; without it the order ran was ascending source index.

**Measured in the suite** [measured, #1283] (darwin, Apple M4, the controls'
own lines):

| subject | the removals' triangles | with the post-pass | with the load order |
| --- | --- | --- | --- |
| `MQ79`'s ramp, strict (28 / 0) | `MQ_LOCAL_DEFORMATION` 1.807703, refused | **0.244565, accepted** — same 28 vertices, 30 flips (`MQ97`) | — |
| this section's fixture, bisected on `grid` | step 45 of 134, 191 vertices (`MQ88`) | **step 101, 135 vertices**, grid 0.912243, held-out 0.854203 (`MQ98`) | **step 96, 140 vertices**, 0.655363 / 0.613681 (`MQ103`) |

These are the stage-A record's figures (0.2446; 135; 140) — the ramp differs
in the sixth decimal from the record's 0.244563 by a cocircular tie the
record also names. The fixture's strict run keeps its 102 / 0 under either
opt-in; the load order reaches it in the same 338 candidates.

**Measured on the recorded inputs** [measured, #1283] — the tree at
`b2503e4` against this one, the 18 inputs of the stage-D1 record at 2.20.0
(`reduceMeshWith` over the recorded input; darwin, Apple M4, 1-minute load
2.4–3.6 with other sessions running):

- **Opt-out bytes.** Mesh and report identical, **18 of 18** without
  `boundaryRuns` and **18 of 18** with `boundaryRuns: { maxVertices: 8 }`.
- **The vertex set under the pass.** Points, UVs, hull, weights, `indexMap`,
  insertions and deform keys identical to the call without it on **16 of 16**
  inputs that return a mesh (18 of 18 with `boundaryRuns`); the pass was taken
  on 15 and refused on 1 — a synthetic input whose refined source already
  fails `MQ_DEGENERATE` before any removal, which the pass's result fails too.
- **Replay under the pass.** `stopAfterAccepted: k` at the first, middle and
  last operation equals the budget cut at that operation's `step`, mesh for
  mesh, on **116 of 116** probes that land on a removal or a boundary run
  (`retriangulate`, both opt-ins, and `retriangulate` with `boundaryRuns`).
  The 12 probes that land on a refinement insertion have no budget cut to
  compare with — a budget spent inside the refinement returns no mesh, with or
  without the opt-in (`MQ81`).

Vertices kept / candidates / elapsed ms, the median of three runs, each
(tree, path) in its own process:

| input | b2503e4 | opted out | `retriangulate` (flips) | `removalOrder` | both | `boundaryRuns` 8, b2503e4 | `boundaryRuns` 8 | + `retriangulate` | + both |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| demo/bottomwear | 282 / 1,101 / 1,131 | 282 / 1,101 / 1,202 | 282 / 1,101 / 1,221 (247) | 282 / **818** / 1,191 | 282 / 818 / 1,121 | 223 / 4,029 / 3,963 | 223 / 4,029 / 4,148 | 223 / 4,029 / 4,231 | 223 / 4,029 / 4,213 |
| demo/neck | 14 / 103 / 21 | 14 / 103 / 22 | 14 / 103 / 27 (11) | 14 / 103 / 24 | 14 / 103 / 24 | 14 / 299 / 30 | 14 / 299 / 30 | 14 / 299 / 32 | 14 / 299 / 33 |
| sample/bottomwear | 101 / 331 / 243 | 101 / 331 / 252 | 101 / 331 / 296 (63) | 101 / 331 / 241 | 101 / 331 / 251 | 95 / 1,694 / 781 | 95 / 1,694 / 748 | 95 / 1,694 / 798 | 95 / 1,694 / 881 |
| sample/neck | 26 / 133 / 26 | 26 / 133 / 26 | 26 / 133 / 30 (28) | 26 / 133 / 32 | 26 / 133 / 32 | 21 / 430 / 59 | 21 / 430 / 55 | 21 / 430 / 55 | 21 / 430 / 65 |
| sample/sleeves | 190 / 421 / 209 | 190 / 421 / 192 | 190 / 421 / 221 (83) | 190 / 421 / 230 | 190 / 421 / 233 | 166 / 2,810 / 1,438 | 166 / 2,810 / 1,206 | 166 / 2,810 / 1,275 | 166 / 2,810 / 1,352 |
| sample/topwear | 63 / 205 / 78 | 63 / 205 / 70 | 63 / 205 / 84 (40) | 63 / 205 / 77 | 63 / 205 / 81 | 59 / 1,031 / 229 | 59 / 1,031 / 230 | 59 / 1,031 / 234 | 59 / 1,031 / 247 |

(sample/hair_back is `invalid-input` at admission on every path.) Kept is the
result's vertex count — every one of them on the outline, no interior vertex
left on any path. The post-pass changes no count by construction — what
it changes is the motion of a replay, which these inputs have no public rig
to pose (D2 is where they are posed) — and costs +2 to +23 % of the
opted-out median here, the largest share on the smallest inputs and inside
the spread of three runs on the largest (demo/bottomwear 1,205–1,345 ms
against 886–1,282). The load order keeps the same fully reduced results,
needs **283 fewer candidates on demo/bottomwear** (1,101 → 818) and the same
elsewhere, and costs −4 to +23 % of the opted-out median. The runs' path is
unchanged by either field in candidates, as its own order says. The stage-A
record's +0–5 % and +0–15 % were a scratch copy's, on another load; these are
the tree's.

**Not done here.** Neither field touches the boundary runs' order or
acceptance, P19, the deform remap or the UV window; relocation (Q5) stays
unbuilt. Whether a replay under either passes motion is parts's comparison to
decide, on the replay, as every step is (Q6).

### Stage B — the amplitude on a reduction [implemented, #1287]

`MeshReductionInput.motionAmplitude?: MotionAmplitude | null` — the field
*Implemented — the allocation rows* defines on the measurement, with the same
shape and the same handling:

- **Left out**, it is not declared, and the call is the one it was before the
  field existed: the result's `MQ_ALLOCATION_CONTRAST` and `MQ_DEFORM_LOAD`
  are `not-measurable` naming the field left out, and `effective` has no key
  for it. **`null`** declares it absent — the same two rows `not-measurable`,
  the reason saying so, and `effective.motionAmplitude: null`. Anything else
  that is not a `MotionAmplitude` in full is refused `REDUCE_INPUT_MISSING`
  naming its path (`motionAmplitude.tracks[0].pairs[0].theta`, …), by the
  measurement's own validator (`validateMotionAmplitude`, so the two refuse
  one value in the same words) and **before any work** — before the
  admission, because a call whose source the admission refuses never reaches
  the one measurement that reads the field, and a check left to that
  measurement would accept a malformed value there (`MQ108`).
- **Set**, the result's own measurement — the one `candidates[0]` carries —
  reads it, so the two rows are measured on the reduction's report, equal to
  what measuring the returned mesh again with `measureMeshQuality`, the
  call's targets, the source hull and the same amplitude reads (`MQ106`). It
  is echoed in `effective`, between `boundaryRuns` and `retriangulate`, also
  on a call that returns no mesh (`MQ110`).
- **Both rows stay `undeclared`**: no step is decided by either and nothing
  counts them towards acceptance, so the mesh, `acceptedAt`, the termination,
  `accepted`, the verdict and every byte of the report but the two rows, the
  echo and the section summaries are the call's without the field (`MQ109`).

**Where it is read — decided on measurement.** The card asked for the
amplitude in every measurement the reduction takes (admission, each step,
final), unless the per-step cost said otherwise. It does: the result's own
measurement only. Two reasons, the second measured. (1) Nothing reads the
two rows anywhere else — the admission's rows decide only the source's art
bounds and its refusals, a step's only `firstBlockingRow`, which names none
of the five allocation rows, and the post-pass's only the same; no report
carries those measurements' rows. (2) The cost: Δ reads B\* over the
*measured mesh's own* hull, which changes at every step, so the memo that
makes B\* over the source hull once per call does not apply. Nova pool
(WSL2, Bun 1.4.2, 1-minute load 0.0–1.05), median of three alternating runs
for the first two columns, one run for the third, the call's measurements
counted on its rasters (`tally.uses`), under the assumed amplitude of
*Implemented — the allocation rows* (θ = 2 sin 2.5° between every pair of the
source's weighted bones, ε 1, G 0.75):

| input | without the field | result's measurement only | every measurement (measurements) | per measurement |
| --- | --- | --- | --- | --- |
| demo/bottomwear | 1,056 ms | 1,017 ms | 42,564 ms (258) | +161 ms |
| demo/bottomwear, `boundaryRuns` 8 | 4,873 | 4,505 | 54,706 (288) | +174 |
| sample/bottomwear | 226 | 289 | 5,355 (133) | +38 |
| sample/sleeves | 219 | 279 | 1,894 (45) | +36 |
| sample/topwear | 69 | 75 | 1,298 (83) | +15 |
| sample/neck | 27 | 33 | 626 (85) | +7 |
| demo/neck | 20 | 21 | 403 (79) | +5 |

Carried into every measurement the call costs 9× to 40× (demo/bottomwear:
+41.5 s) and writes **the same bytes** as carried into the result's alone —
on all 54 calls below and in suite (`MQ109`, which runs that path as a
`ReductionPlant` that is not a fault). On the result's alone the cost is one
Δ and one load over the result, inside the spread of the runs here (−368 to
+63 ms against the column before it).

**Measured on the recorded inputs** [measured, #1287] — the tree at
`5be70d8` against this one, the 18 inputs of the stage-D1 record at 2.20.0,
same machine:

- **Opt-out bytes.** A call without the field — mesh and report — is
  byte-identical to `5be70d8`'s on **90 of 90** calls: every input with no
  opt-in, with `boundaryRuns: { maxVertices: 8 }`, with `retriangulate`, with
  `removalOrder` and with all three.
- **With the field and with `null`**, on every input without an opt-in, with
  `boundaryRuns` 8 and with `retriangulate` (**54 of 54**): the mesh
  identical to the call without it, and the report identical but for the two
  rows, the echo and the summaries; termination, `acceptedAt`, `accepted` and
  the verdict identical; a second call with the field identical to the first.
  On the 8 example inputs that return a mesh the load is measured (demo/neck
  0.508863 px, sample/neck 1.156903, sample/bottomwear 4.932996, demo/bottomwear
  13.320207 without an opt-in) and Δ reads 0 — on these results every vertex
  is on the outline. On the synthetic inputs, which are unweighted, both
  rows stay `not-measurable` naming `source.weights` — not the amplitude.
  sample/hair_back and one synthetic input return no mesh, so no row.

**Not done here.** The field is read by no step; a removal order or an
acceptance that reads the amplitude would be a separate opt-in, as
`removalOrder` is, and none is proposed.

### G — what it derives from [measured, #1291]

rig-parts's STOP on rig-parts#126, after its rerun of Stage B: parts derives
θ per pair and ε from the motion it declares and then has nothing to put in
`motionAmplitude.gradation` — no field of a rig or of its configuration
declares it, and inventing a number is not parts's to do — so it sends no
amplitude, and `MQ_ALLOCATION_CONTRAST` and `MQ_DEFORM_LOAD` read
`not-measurable` in every cell of the rerun. Its preference, in order: G
derives from what a rig declares; it becomes optional with a stated default;
it stays an author number with its meaning written for an author.

**What G is.** Δ's need field (*Implemented — the allocation rows*,
`allocationContrast` in `src/meshallocation.ts`) is h\*(p) = min over the
sources of h_s + G · d(p, s): each B\*-outline edge needs its own length, each
deforming triangle needs √(4ε / (θ · |∇share|)), and each declared region
holds its own L0 inside and L0 + `grade` · d over its band — the region
already relaxes at its own declared `grade`, so G governs the first two kinds
only. A vertex is removable alone when its cheapest collapse makes no new edge
longer than h\* at its midpoint (and breaks no other need). G is therefore the
rate at which a need is allowed to relax with distance: it is what makes a
graded layer beside a dense source read as needed rather than as slack.

**Every candidate derivation, measured.** On §8's six fixtures (their own
amplitude: θ = 5° in radians, ε = 0.035 px), on `MQ79`'s source, its
motion-accepted replay at step 94 and its strict result (θ = 5°, ε = 1), on
the #1271 reproducer's (`MQ85`) source, its bisected replay at step 45 and its
strict result (θ = 2 sin 2.5° on each of the pairs a–b, b–c, a–c, ε = 1), and
on the sources of the seven demo and sample inputs of the stage-D1 record [the
assumed amplitude of *Implemented — the allocation rows*: θ = 5° between every
pair of the source's weighted bones, ε = 1] — which reproduce that subsection's
G 0.75 readings (sample/neck −0.214, sample/topwear −0.514, sample/bottomwear
−0.047, demo/bottomwear −0.351). Δ, by G (∞ read at G = 10¹², where the need is
carried at its source only):

| subject | 0 | 0.25 | 0.5 | 0.75 | 1 | 1.64 | 4 | ∞ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F+ (accept) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| N1 (flag) | 0.871 | 0.871 | 0.871 | 0.890 | 0.890 | 0.852 | 0.909 | 0.909 |
| N2 (accept) | 0 | 0 | 0 | 0 | 0.005 | 0.124 | **0.267** | **0.267** |
| N2a (accept) | 0 | 0 | 0 | 0 | 0 | 0.019 | 0.019 | 0.019 |
| N3 (accept) | 0 | 0 | −0.364 | −0.941 | −0.898 | −0.592 | −0.592 | −0.592 |
| N4 (flag) | 0.429 | 0.429 | 0.510 | 0.510 | 0.510 | 0.510 | 0.510 | 0.510 |
| `MQ79` source | 0 | 0.061 | **0.306** | 0.020 | 0.163 | −0.112 | −0.112 | −0.071 |
| `MQ79` replay, step 94 | **0** | 0.024 | **0.238** | 0.357 | 0.385 | 0.481 | 0.481 | 0.481 |
| `MQ79` strict | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `MQ85` source | 0 | 0 | 0 | −0.434 | −0.697 | −0.728 | −0.697 | −0.697 |
| `MQ85` replay, step 45 | 0 | 0 | −0.041 | 0.060 | 0.173 | 0.237 | −0.094 | −0.094 |
| `MQ85` strict | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| demo/bottomwear | 0 | 0 | −0.064 | −0.351 | −0.540 | −0.812 | −0.836 | −0.835 |
| demo/neck | 0 | 0.394 | 0.530 | 0.450 | 0.375 | 0.350 | 0.350 | 0.350 |
| sample/bottomwear | 0 | 0 | 0 | −0.047 | −0.360 | −0.607 | −0.697 | −0.697 |
| sample/hair_back | 0 | 0 | 0 | 0 | 0 | −0.167 | −0.649 | −0.676 |
| sample/neck | 0 | 0 | −0.210 | −0.214 | −0.228 | −0.243 | −0.209 | −0.209 |
| sample/sleeves | 0 | 0 | 0 | 0 | 0 | −0.167 | −0.631 | −0.671 |
| sample/topwear | 0 | 0 | −0.162 | −0.514 | −0.622 | −0.684 | −0.659 | −0.659 |

Scratch script importing the tree at `32e5cc1` (v2.28.0), the fixtures built
by the suite's own builders; darwin, Apple M4, Bun 1.4.2, 1-minute load 4.4.
The fixtures' separation is the record's (must-accept ≤ 0.124 against must-flag
≥ 0.510 over G 0.5–1.64, §8's bar 0.25 between them).

| candidate | G from | where it is defined | what it reads | verdict |
| --- | --- | --- | --- | --- |
| (a) a region's band | the region's declared `grade` — (L(T) − L0) / T, the band's own slope; the record's 0.75 is N2's | 2 of 19 subjects (N2, N2a) | 0 and 0 there | ✗ undefined on every input parts sends: none of the seven declares a region, nor `MQ79` or `MQ85` |
| (a′) the band against the local edge length | L0 / `transition` | the same 2 | 4 / 16 = 0.25: 0 and 0 there; applied to `MQ79` anyway, its uneven replay reads 0.024 against the bar 0.25 | ✗ as (a) |
| (b) the policy's spacing alone | a declared `maxEdgeLength` or spacing outside a region | nowhere: `RefinementRegion.maxEdgeLength` is the only declared length, and `MeshMeasureInput` and `MeshReductionInput` declare no spacing | — | ✗ no such input |
| (b′) the only spacing without a region — the mesh's own | the measured mesh's `MQ_GRADE` | every subject | fixtures separate (accept ≤ 0.019, flag ≥ 0.510); `MQ79` 0.082 / 0.481; but the recorded sources' own grade is 1.19–10.15 and `MQ85`'s replay and strict 13.08 and 36.58, so on every real input it sits past the fixtures' range and reads within 0.03 of the ∞ column | ✗ a standard taken from the thing measured — the rejection §8 already makes of a transition term built from the mesh's own sizes — and it moves at every step of a reduction |
| (c1) need carried at its source only | G → ∞ (no decay constant) | every subject | N2, which must be accepted, reads **0.267**, over the bar | ✗ loses a separation |
| (c2) need carried everywhere | G = 0 | every subject | E = 0 at every `MQ79` step measured (24, 47, 70, 94); the replay that the other readings flag reads 0, and so does every recorded source | ✗ reads nothing |
| (c3) a feature size's constant | G = 1, the Lipschitz constant of the local feature size | every subject | holds on the fixtures (0.005) and `MQ79` (0.163 / 0.385) | ✗ a constant of another construction: h\* is not a feature size, so nothing in Δ's definition yields 1 |
| (c4) §8's grade bar | G = 1.64 | every subject | holds on the fixtures (0.124) and `MQ79` (−0.112 / 0.481) | ✗ the midpoint of a separation on six fixtures from one synthetic domain, for an `undeclared` row; Δ's definition would then be that domain's |

**No derivation holds, and G is not removable from Δ's definition.** It
enters only as the rate in h\*; the collapse test compares an edge with h\* and
says nothing about how h\* falls away from its sources. The two readings that
need no constant are its limits, and each loses something §8 relies on: carried
at the source only, the must-accept N2 crosses the bar; carried everywhere,
nothing is removable and the reading is blind. Every value between is a
choice, and the choice matters: on the seven recorded sources Δ moves by up to
0.84 across G and is not monotone in it (demo/neck 0.394 → 0.530 → 0.450 →
0.375 → 0.350), and inside the range §8 recorded as safe on its fixtures, `MQ79`'s
uniformly over-dense source and its uneven replay **swap order** — 0.306 /
0.238 at G 0.5 (the source over the bar, the replay under it) against
0.020 / 0.357 at 0.75. ⚠️ **Correction [measured, #1291]** to *Measured —
spatial measurements of allocation*: "holds for gradation G 0.5–1.64" is true
of the six fixtures and does not transfer — on `MQ79` the separation that row
reports holds from 0.75, not from 0.5.

**So the field stays, and it is the author's** (parts's option 3): option 2
needs a default that derives from the row's own definition, and the
measurement shows there is none to state. What changed is that it is no
longer required to send an amplitude: `MotionAmplitude.gradation?: number |
null`, validated as before when set (finite, 0 or more; a non-finite value is
now named as itself, `NaN` rather than JSON's `null`, which the field accepts).
Left out or `null`, `MQ_ALLOCATION_CONTRAST` is `not-measurable` with a reason
naming `motionAmplitude.gradation` — left out or declared absent — and
`MQ_DEFORM_LOAD`, which never read G, is measured from θ alone: on the seven
recorded sources it reads the same row with and without a gradation, 7 of 7.
That is what the STOP cost parts: θ and ε were declared, and the load was
withheld for want of a number it does not read. The echo writes `gradation`
only when the caller set it, `null` included.

**For an author: what a value of G means.** G, px per px, is how fast the
mesh may coarsen away from something that needs density — an edge of the
B\* outline, a triangle whose weights turn under the declared motion. At d px
from a need of size h the reading allows edges up to h + G · d, exactly the
form of a region's `grade`, and it is the same quantity: if the author would
grade a region at some rate on this mesh, that rate is the G to declare.
Larger G lets the need relax sooner, so more dense vertices read as removable
— Δ and economy E rise, and a graded layer around a need starts to read as
slack; smaller G keeps more of them needed, and at 0 every point needs the
smallest size any source declares, so nothing reads as removable. §8's
fixtures used 0.75 because it is the one `grade` any of them declares (N2's
region), so the other needs were graded like the declared one; it is a value
those fixtures chose, not a default rigc holds.

**What the card and the brief said that the tree does not.** The card's
acceptance said an absent `gradation` "already" reads `not-measurable`; it was
refused — `{ tracks }` without `gradation` was `REDUCE_INPUT_MISSING`
(`MQ127`'s "gradation left out" case, now moved to the admitted ones). The
candidate "the band relative to the local declared edge length" is (a′): a
region already declares its slope as `grade`, so the band yields G directly
where there is one, and there is none on parts's inputs. The reason sentence
for an amplitude left out still says "required { tracks, gradation }" on both
rows; rewording it for the load would move the bytes of every report written
without an amplitude, so it stays, and the load's own reading is the
correction.

**Controls [implemented, #1291]**, in `mesh-quality`: `MQ127` (a gradation
that is a string, negative, `NaN` or infinite refused naming its own value;
left out and `null` admitted), `MQ128` (an amplitude without gradation, and
with it `null`: the load as with it, Δ `not-measurable` naming which, every
other row, the verdict and the acceptance unchanged, the echo with no key and
with `null`; plants: an absent gradation read at 0.75 — the default this
subsection declines — and the load refused for want of it) and `MQ129` (the
two limits and the swap above, on N2 and on `MQ79`'s source and step-94
replay; plant: the need relaxed at 0.75 whatever is declared, which makes all
three claims fail).

**Opt-out [measured, #1291].** The tree at `32e5cc1` against this one, the 18
inputs of the stage-D1 record at 2.20.0, one process per tree, darwin, Apple
M4: report and mesh identical on **108 of 108** calls — `reduceMesh` with no
opt-in, with all three opt-ins, with an amplitude carrying a gradation and with
it `null`, and `measureMeshQuality` on the source without and with that
amplitude.

### Stage B — the amplitude on a comparison [implemented, #1291]

rig-parts noted with its rerun that `MotionComparisonInput` had no
`motionAmplitude`, so the amplitude could not reach the comparison's
measurement. It was not intended. `compareMeshesInMotion`'s setup section is
`measureMeshQuality` run on each build's mesh at the setup pose, so the field
is the measurement's, with the measurement's handling:

- **Left out**, the comparison is the one it was: the setup sections'
  `MQ_DEFORM_LOAD` and `MQ_ALLOCATION_CONTRAST` are `not-measurable` naming the
  field left out, and `effective` has no key for it. **`null`** declares it
  absent, the reasons saying so, and `effective.motionAmplitude: null`.
- **Set**, it is handed to the setup measurement of the reference and of every
  candidate, and to nothing else: `MQ_DEFORM_LOAD` is measured on each setup
  section (`MQ111`: on `MQ79`'s ramp, 0.012441 px on the source and 1.813205
  on its strict reduction, doubling with θ). **`MQ_ALLOCATION_CONTRAST` stays
  `not-measurable` there, naming `targets.maxBoundaryDeviation`**: the
  comparison declares no deviation bound and no reference hull, so Δ, which
  reads both, has nothing to be held to. Rather than invent either, the row
  says which.
- **Refused** when it is not a `MotionAmplitude` in full — with
  `COMPARE_INPUT_MISSING`, the comparison's own code, in the measurement's
  words (`validateMotionAmplitude`), before any build is read (`MQ113`);
  left to the setup measurement it would be refused under the measurement's
  code, and only after both model documents had been parsed.
- **Echoed** in `effective` when set, `null` included, in the type's key order
  and without a `gradation` key when the caller left it out (`MQ114`).
- **No verdict moves**: both rows are `undeclared`, and no frame, motion row
  or acceptance reads the field — a posed comparison with the field and with
  `null` is the one without it but for the two setup rows, the echo and the
  setup summaries (`MQ115`).

Controls `MQ111`–`MQ115` in `mesh-compare`, each with a plant
(`ComparePlant`, through the internal `compareMeshesInMotionPlanted`): the
amplitude not carried, `null` carried as left out, the field not validated
before the builds are read, `null` echoed for a field left out, and the load
counted towards the setup verdict. **Opt-out [measured, #1291]:** the
recorded inputs carry no builds, so the comparison's bytes were measured on
`MQ79`'s ramp instead — its source build against its reduction replayed to
steps 0, 47 and 94 and fully, posed on `idle` at 12 fps on `grid` and `irr`,
the tree at `32e5cc1` against this one: the report identical, **4 of 4**
(darwin, Apple M4). `MQ115` holds the shape in suite.

### Stage B — rig-parts's rerun [observed, rig-parts PR #147]

**[observed, rig-parts PR #147]** marks figures parts measured and posted on
rig-parts#126 (its `docs/evidence/auto-stageb-survey.md`, re-runnable); none
was re-measured here. parts reran all of Stage B on its eight public parts at
rig-c 2.28.0 under its stated policy, unchanged — bound 1 rig px,
`maxBoundaryDeviation` 1, source tolerance 1:

| configuration | vertices written over the eight parts |
| --- | --- |
| baseline (no opt-in) | 934 |
| `boundaryRuns` | 919 |
| `retriangulate: 'delaunay'` | 862 |
| `removalOrder: 'deformation-load'` | 896 |
| all three | **694** |

- **Every cell accepted — 40 of 40** — by parts's motion comparison.
- **demo/bottomwear**, the part #1266's replay alone left at 415 vertices,
  writes **229** with all three.
- **The non-monotone case on a real part**: sample/sleeves under
  `boundaryRuns` alone writes 223 against the baseline's 192, because the
  bisection found a passing step 3 of 50 and not the last — recorded under
  Q4's correction above; with all three opt-ins it is fine.
- **Replay byte-exact under every opt-in** on parts's inputs, 64 of 64 probes.
  The regenerated baseline matches parts's tracked survey but for the version
  string; its lattice and contour outputs are byte-identical.
- On parts's side the opt-ins are author fields on `meshes.<part>.auto`
  (absent = off), `acceptedAt` is read per accepted operation, and the five
  allocation rows are carried `undeclared` — with Δ and the load
  `not-measurable` in every cell for want of a gradation, the STOP *G — what
  it derives from* answers.

## 9. Cost — the reduction and the comparison, profiled by phase and by row (#1304)

[measured, #1304] Stage A of
[#1304](https://github.com/rig-c/core/issues/1304): where a `reduceMesh`
call under the dependant's trial policy spends its time and memory, and what
`compareMeshesInMotion` spends at the trial's schedule — **measured, nothing
changed**. No bound, budget, threshold, frame rate or sample count moves in
any candidate below; a candidate that would need one is listed as rejected
with the reason. Every figure is one machine's reading at the load stated, not
a claim about another; the scripts, logs and profiles are in the stage-A
record for #1304, and its commands are at the end of this section.

### Method

- **An instrumented copy.** The tree at `5e8acd6` (`src/`, `tools/`,
  `package.json`) copied and patched by exact-text edits: section timers and
  counters in `src/meshreduce.ts`, `src/meshquality.ts`,
  `src/meshrasters.ts`, `src/meshskinning.ts`, `src/meshcarriers.ts` and
  `src/meshcompare.ts` (`src/meshallocation.ts` is timed at its call sites),
  each behind one switch — off, a site costs a clock call that returns 0 and
  a boolean read. Per attempt,
  every section's time is folded under the attempt's outcome (taken, refused by
  the floor, by a named row, by the residual, by the structure), so "what the
  attempts the floor refuses spend before the floor" is a reading, not an
  apportionment. A second switch (`check`) adds two readings used below: the
  floor read off a predicted outline beside the floor read off the canonical
  candidate, and where in a vetoed residual trial the first sample over the
  bound falls.
- **The population.** The 18 recorded inputs of the stage-D1 record, the
  with-region input of #1253 (`demo__bottomwear__region` below), `MQ79`'s ramp
  and `MQ85`'s traced bean, each under five policies: as recorded (`rec`); the
  trial policy **T** — `boundaryRuns: { maxVertices: 8 }`, `retriangulate:
  'delaunay'`, `removalOrder: 'deformation-load'`; **TS** — T with
  `targets.skinning` at #1295's stand-in envelope (every bound bone at
  `linear` 0.1 about the origin, no translation term, reference `(none)`,
  `maxResidual` 1); **TA** — T with #1287's assumed `motionAmplitude` (θ =
  2 sin 2.5° between every pair of the source's weighted bones, ε 1,
  G 0.75); **TSA** — both. The stand-in envelope decides which steps are
  vetoed, so every TS figure is this envelope's, not parts's. The nine
  unweighted synthetic inputs take no envelope: 87 calls, 18 skipped. Inputs
  other than demo/\* and sample/\* are named by the record's label.
- **The machine.** Nova pool jobs (WSL2 Linux 6.6, x86_64, 20 threads,
  Bun 1.4.2), pooled rather than exclusive, the 1-minute load read at every
  call's start: 1.0–2.5 for the population run, 1.1–1.9 for the run the
  phase and outcome tables are read from. Each call in its own process: three
  tree runs and three instrumented runs, alternated; the tables give the
  median. The instrumented wall is 0.90–1.25 times the tree's (median 1.02).
  Live heap sizes were read on an Apple M4 (darwin, Bun 1.4.2): they are the
  engine's, not the machine's.

### Byte identity of the instrumented copy

`writeMeshQualityReport(report)` and the mesh, hashed, for the tree, the copy
switched off and the copy switched on: **identical on 87 of 87 calls**, at
each of the four versions the copy went through; with the `check` switch on,
the same 87 of 87. The comparison's report through the copy equals the tree's on
both fixtures (6 of 6 runs).

### Where a call's time goes

Tree wall (median of three, ms) and candidates tried, per policy; peak RSS
under T and TS:

| input | rec | T | TA | TS | TSA | peak RSS MiB, T / TS |
| --- | --- | --- | --- | --- | --- | --- |
| demo/neck | 47 (103) | 61 (299) | 63 (299) | 95 (305) | 97 (305) | 73 / 81 |
| sample/neck | 67 (133) | 106 (430) | 108 (430) | 162 (440) | 169 (440) | 81 / 101 |
| `scarf__hair_front` | 77 (176) | 237 (850) | 236 (850) | 598 (1,433) | 625 (1,433) | 92 / 135 |
| sample/topwear | 128 (205) | 334 (1,031) | 340 (1,031) | 701 (1,595) | 713 (1,595) | 105 / 224 |
| `scarf__handwear_l` | 376 (445) | 958 (1,344) | 953 (1,344) | 1,985 (2,158) | 1,987 (2,158) | 131 / 294 |
| sample/sleeves | 296 (421) | 1,550 (2,810) | 1,410 (2,810) | 2,078 (3,027) | 2,072 (3,027) | 213 / 383 |
| sample/bottomwear | 282 (331) | 773 (1,694) | 798 (1,694) | 2,276 (1,907) | 2,418 (1,907) | 167 / 690 |
| demo/bottomwear | 1,112 (1,101) | 4,266 (4,029) | 4,095 (4,029) | 11,823 (4,514) | 11,714 (4,514) | 341 / 1,950 |
| `demo__bottomwear__region` | 3,973 (1,443) | 10,716 (4,315) | 11,589 (4,315) | 2,814 (262) | 5,007 (262) | 399 / 1,768 |
| `MQ79` ramp | 161 (175) | 415 (627) | 408 (627) | 475 (627) | 475 (627) | 118 / 142 |
| `MQ85` bean | 228 (338) | 815 (1,776) | 822 (1,776) | 2,382 (4,407) | 2,363 (4,407) | 150 / 317 |

The nine synthetic inputs run in 17–49 ms each but
`synthetic__tiny_region_source_at_L0` (617 vertices, 1.0–1.2 s on every
policy). Under TS the with-region input
stops before any removal — the refined source reads over the residual bound —
so its TS call is the refinement, the carried state's build and the result's
row, and is shorter than its T call. The amplitude (TA) is read by the
result's measurement only (#1287): Δ and the load cost 52 ms on
demo/bottomwear and 1.3 s on the with-region input (C7 below).

**By phase**, the instrumented wall (median of three, ms, and share); a dash
is under 0.5 ms:

| phase | demo/bottomwear T | demo/bottomwear TS | sample/neck T | sample/neck TS |
| --- | --- | --- | --- | --- |
| wall | 4,062 | 11,509 | 111 | 168 |
| the art's rasters (once per call) | 76 (1.9 %) | 79 (0.7 %) | 4 (3.3 %) | 4 (2.1 %) |
| residual admission and carried-state build | — | 251 (2.2 %) | — | 8 (4.6 %) |
| admission (less the rasters) and start check | 96 (2.4 %) | 106 (0.9 %) | 12 (11.2 %) | 13 (7.5 %) |
| load order and outline walks | 91 (2.2 %) | 174 (1.5 %) | 5 (4.7 %) | 5 (3.2 %) |
| **single removals, every attempt** | 573 (14.1 %) | 4,156 (36.1 %) | 38 (34.2 %) | 72 (42.5 %) |
| — structure: the removal's triangles and added edges | 69 (1.7 %) | 164 (1.4 %) | 4 (3.4 %) | 4 (2.2 %) |
| — structure: protected-edge set (a), `weightJump` (b) | 49 (1.2 %) | 122 (1.1 %) | 4 (3.2 %) | 2 (1.2 %) |
| — structure: canonical order and outline | 148 (3.6 %) | 369 (3.2 %) | 6 (5.2 %) | 9 (5.2 %) |
| — deviation floor | 2 (0.0 %) | 3 (0.0 %) | — | — |
| — the rows (measurement and verdict) | 307 (7.6 %) | 780 (6.8 %) | 25 (22.0 %) | 31 (18.4 %) |
| — the residual: carried trial, commit or rollback | — | 2,753 (23.9 %) | — | 25 (14.9 %) |
| **boundary runs, every attempt** | 3,164 (77.9 %) | 6,072 (52.8 %) | 45 (40.6 %) | 49 (29.3 %) |
| — structure: the removals' triangles and added edges | 1,977 (48.7 %) | 3,769 (32.7 %) | 29 (26.3 %) | 33 (19.3 %) |
| — structure: protected-edge set (a), `weightJump` (b) | 231 (5.7 %) | 514 (4.5 %) | 2 (1.7 %) | 2 (1.2 %) |
| — structure: canonical order and outline | 770 (19.0 %) | 1,465 (12.7 %) | 9 (8.0 %) | 8 (5.0 %) |
| — deviation floor | 56 (1.4 %) | 66 (0.6 %) | 1 (0.5 %) | — |
| — the rows (measurement and verdict) | 123 (3.0 %) | 195 (1.7 %) | 3 (3.0 %) | 4 (2.3 %) |
| — the residual | — | 51 (0.4 %) | — | 1 (0.8 %) |
| a floor refusal's name, measured when read | 11 (0.3 %) | — | 1 (0.7 %) | 1 (0.6 %) |
| post-pass (flips, one measurement, residual) | 26 (0.6 %) | 34 (0.3 %) | 3 (2.3 %) | 6 (3.4 %) |
| final measurement | — | 765 (6.6 %) | — | 6 (3.3 %) |
| — of which `MQ_SKINNING_RESIDUAL` | — | 761 (6.6 %) | — | 4 (2.6 %) |
| unattributed | 3 (0.1 %) | 19 (0.2 %) | 1 (1.3 %) | 3 (2.1 %) |

- **The boundary runs are most of a T call, and almost none of it is their
  rows.** On demo/bottomwear 3,300 of 3,335 run attempts are refused by #1279's
  deviation floor — a test of 56 ms over all of them — after the structure has
  been built for each: 1,977 ms of the removals' triangles and added edges,
  770 ms of canonical order, 231 ms of the protected-edge set. Inside the
  removals, 1,568 ms is each inner removal's set of the triangulation's edges
  (`removalOf` builds it to name the edges it adds, and a run discards all but
  the last removal's) and 417 ms the run's own added-edge set; the ear-clip is
  29 ms.
- **The residual's carried trial is a quarter of a TS call, and nearly all of
  it is trials it vetoes.** demo/bottomwear: 530 trials, 501 vetoed; the
  search over affected samples is 2,638 ms, 2,558 ms of it in vetoed trials;
  1,916,478 samples recomputed and 8,500,629 containment tests; no fallback
  rescan. The `check` reading: in a vetoed trial the first sample over the
  bound is reached after **3.9 %** of the trial's affected samples
  (73,445 of 1,899,571, demo/bottomwear), 3.7 % on sample/bottomwear,
  7.2–31 % on the seven other TS calls, 6.9 % over every TS and TSA call
  together (474,996 of 6,872,294) — and every one of the 3,848 vetoed trials
  has an affected sample over the bound.
- **The result's residual row is measured whole**: 761 ms on demo/bottomwear,
  of which the terms over every sample 571 ms, the two carrier searches 72 ms
  (source) and 87 ms (candidate), the contract 26 ms.

### The step measurement's rows

What a measurement of a step spends, demo/bottomwear T (284 measurements,
429 ms) and the with-region input under T (321 measurements, 1,382 ms; its
refinement, 263 measurements more, 930 ms):

| row or part | demo/bottomwear T | `demo__bottomwear__region` T | read by the decision? |
| --- | --- | --- | --- |
| coverage, carried (`StepRasters.coverage`) | 188 (43.8 %) | 210 (15.2 %) | yes |
| allocation rows (`MQ_GRADE` 39, `MQ_MIN_ANGLE_P10` 13, B\* memo 4) | 63 (14.7 %) | 140 (10.1 %) | **no** — never required |
| `MQ_BOUNDARY_DEVIATION` | 55 (12.8 %) | 55 (4.0 %) | yes |
| region rows with no region (`meshEdges`, its sort, the refusal loop) | 43 (9.9 %) | — | **no** |
| region rows: `MQ_MAX_EDGE`, `MQ_TRANSITION` | — | 410 (29.7 %) | yes |
| region rows: `MQ_FILL_DISTANCE` | — | 419 (30.3 %) | **no** — never required |
| outline (`traceOutline`, `checkHullOrder`) | 24 (5.5 %) | 42 (3.1 %) | yes (the measured mesh) |
| `MQ_MIN_ANGLE`, no bound declared | 19 (4.3 %) | 54 (3.9 %) | **no** |
| orientation, degeneracy | 8 (1.9 %) | 13 (0.9 %) | yes |
| overshoot 8-connected / 4-connected and holes | 6 / 6 | 9 / 9 | 8: yes / 4: **no** |
| islands, echo, assembly | 3 | 4 | no |

The refinement reads `MQ_MAX_EDGE` and `MQ_TRANSITION` only; of its 930 ms the
rows it does not read come to 585 ms (`MQ_FILL_DISTANCE` 279, allocation rows
164 — B\* is first computed here, 50 ms — coverage 77, minimum angle 28).

### What is tried, and what refuses it

| input (T / TS) | single: tried, taken, floor, rows, residual, structure | runs: tried, taken, floor, rows, residual, structure |
| --- | --- | --- |
| demo/bottomwear T | 694, 248, 444, 2, —, 0 | 3,335, 27, 3,300, 7, —, 1 |
| demo/bottomwear TS | 968, 6, 472, 4, 486, 0 | 3,546, 23, 3,501, 7, 15, 0 |
| `demo__bottomwear__region` T | 738, 210, 452, 76, —, 0 | 3,315, 26, 3,279, 9, —, 1 |
| sample/bottomwear T | 317, 127, 188, 2, —, 0 | 1,377, 3, 1,350, 3, —, 21 |
| sample/bottomwear TS | 451, 1, 196, 2, 252, 0 | 1,456, 2, 1,386, 3, 7, 58 |
| sample/sleeves T | 370, 38, 324, 8, —, 0 | 2,440, 12, 2,406, 4, —, 18 |
| sample/sleeves TS | 430, 4, 344, 8, 74, 0 | 2,597, 7, 2,530, 1, 11, 48 |
| sample/topwear T | 195, 77, 118, 0, —, 0 | 836, 1, 782, 0, —, 53 |
| sample/neck T | 123, 81, 42, 0, —, 0 | 307, 2, 191, 0, —, 114 |
| `scarf__handwear_l` TS | 800, 161, 183, 3, 453, 0 | 1,358, 3, 1,139, 3, 0, 213 |
| `MQ79` ramp T | 159, 103, 8, 48, —, 0 | 468, 4, 237, 172, —, 55 |
| `MQ85` bean TS | 865, 80, 500, 0, 285, 0 | 3,542, 1, 3,458, 0, 0, 83 |

The rows that refuse: `MQ_BOUNDARY_DEVIATION` everywhere it is not the floor;
the region's `MQ_MAX_EDGE` 28 and `MQ_TRANSITION` 50 on the with-region input;
`MQ_COVERAGE` on the ramp, 220 attempts (its art is exactly the hull's pixel
centres, so any hull removal uncovers some) — and on no recorded input.
Attempts refused by a named row other than the deviation and the residual
spend at most 4.1 % of a recorded input's wall (the region's two rows on the
with-region input under T) and 52–62 % of the ramp's.

### Memory

| input | the art's rasters | step rasters | carried residual: live heap / `memoryBytes()` | peak RSS, T / TS |
| --- | --- | --- | --- | --- |
| demo/bottomwear | 10.2 MiB | 12.4 MiB | **315 / 129 MiB** | 341 / 1,950 MiB |
| sample/bottomwear | 3.3 | 6.8 | 84 / 41 | 167 / 690 |
| sample/sleeves | 2.9 | 13.4 | 28 / 12.5 | 213 / 383 |
| sample/topwear | 1.2 | 3.6 | 12.3 / 5.0 | 105 / 224 |
| sample/neck | 0.3 | 1.2 | 1.6 / 0.6 | 81 / 101 |

Live heap: the heap after two full collections with the structure held, less
the heap before it (darwin; the rasters fully computed, the step rasters after
one admission-shaped measurement, the carried state as built before any step).
`memoryBytes()` counts the doubles; the live heap is 2.1–2.7 times it on these
five (3.0 on demo/neck), because each sample's source terms are a
`SampleTerms` object of small arrays. The TS peak RSS is another 1.3–1.6 GiB over that on demo/bottomwear — what the
trials and the result's row allocate and drop (per-sample terms, carriers and
residual arrays). A per-process measurement, so it includes the harness
(the recorded input and its base64 mask).

### CPU profile of the largest input

`bun --cpu-prof-md` over the tree, demo/bottomwear (Nova pool, load 2.1–2.2;
4.0 s and 10.3 s of samples at 1 ms). Self time:

| T (4.0 s) | | TS (10.3 s) | |
| --- | --- | --- | --- |
| `removalOf`, the line building its edge set | 15.1 % | `removalOf`, the same line | 18.4 % |
| `Set.prototype.add` (native) | 14.6 % | `sampleResidual` | 9.1 % |
| `edgeKey` (a string per edge) | 8.8 % | `termsAt` | 7.9 % |
| `runRemovalOf` (its own edge sets) | 8.3 % | `Set.prototype.add` (native) | 5.4 % |
| `tryOperation`, the protected-edge set line | 5.5 % | `tryOperation`, the protected-edge set line | 5.3 % |
| `sort` (native: canonical order, load order) | 3.9 % | | |
| `traceOutline` | 3.5 % | `runRemovalOf` | 6.1 % |
| | | `traceOutline` | 4.9 % |
| | | `Math.hypot` (native) | 4.0 % |

Under T, string-keyed edge sets — the set each removal builds, its `edgeKey`
strings, `Set.prototype.add`, the run's own sets and the protected-edge set —
are about half of every sample; under TS the residual's arithmetic
(`sampleResidual`, `termsAt`, `hypot`) is a fifth. On the with-region input
under T a runtime-internal frame (`hideFromStack`) carries 20.7 % of the
samples and the same edge sets most of the rest; that frame is recorded, not
interpreted.

### The comparison

`compareMeshesInMotion` of one candidate — the fixture's T reduction —
against its source at the trial's schedule (`grid` and `irr` at 12 fps over
±5° bends, physics none, bound 1): the ramp walks 50 frames (setup, `idle`
25 + 24), the bean 99 (setup, `bend_b` and `bend_c` 25 + 24 each). Same Nova
job as the profiles; instrumented, median of three:

| part | `MQ79` ramp: 160 × 48 mask, 51 ms | `MQ85` bean: 416 × 195 mask, 614 ms |
| --- | --- | --- |
| the frame loop, every sample at every frame | 39.2 (77.0 %) | 544 (88.6 %) |
| — the reference against itself | 18.6 (36.6 %) | 207 (33.7 %) |
| — the candidate against the reference | 21.5 (42.3 %) | 337 (54.8 %) |
| — stretch and reversal per triangle (inside the above) | 0.8 | 3.8 |
| setup measurement, reference and candidate | 6.2 (12.1 %) | 38.4 (6.3 %) |
| carrier search, reference and candidate | 2.1 | 12.5 |
| posing, reference and candidate | 1.8 | 7.6 |
| reading and diffing the builds, schedule, samples | 1.4 | 3.0 |

Tree walls 49–64 ms and 589–609 ms (load 2.2); the report equal to the
tree's on all six runs. **The reference is compared with itself on every call**: its
`MQ_LOCAL_DEFORMATION` reads each sample's carried point in the reference's
pose twice, so every distance is 0 by construction — a third of the call. The
dependant replays the comparison seven times per part, each against the same
reference.

### The candidates

Each bound is what the profile says the candidate could save **at most** on
today's tree — the time the work it removes takes, from the folded readings —
not an estimate of the cut. Bounds overlap: C1 and C2 remove some of the same
work, so they do not add. Share of the instrumented wall, median of three:

| candidate | what it removes | bound: demo/bottomwear T / TS; other inputs | must prove | risk |
| --- | --- | --- | --- | --- |
| **C1 — edge sets without strings, and only where read** | the per-removal set of every edge (a run discards all but the last), the run's added-edge set when no `weightJump` is declared, the protected-edge set when nothing is protected; the remaining sets keyed by number | 54 % / 38 %; T 41–46 % on the other recorded inputs, 15–27 % on the necks, 22 % ramp, 48 % bean; TS 10–41 % | the added edges in the same order where they are read; byte identity on the 87 calls and the suites' outputs | low: a representation change, no decision reads it differently |
| **C2 — the deviation floor before the structure** | for a removal of source-hull vertices, the floor read off the current outline walk less the removed vertices, turned as `canonicalise` turns it; over the bound, refused by the thunk that already names a floor refusal — so the structure, the protected-edge set and the canonical order are not built for it | 77 % / 52 %; T 51–70 % on the inputs over 300 ms, 14–24 % on the ramp and the necks | the candidate's outline is that walk whenever the structure passes — **82,426 of 82,426** structurally passing attempts on the 87 calls, 18 of them reversed (concave synthetic runs, where `canonicalise` turns the remaining loop the other way), the floor equal bit for bit on all 82,426; of the 73,154 attempts the predicted floor refuses, 69,247 are the floor's today, **3,907 are the structure's** (the thunk then names the structure — the name is the full path's) and **0 are taken** | medium: a run's outline must be derived without the triangles; an observer's `decidedByFloor` changes for those 3,907 |
| **C3 — a verdict measurement for steps** | the rows no step's decision reads: allocation rows, `MQ_FILL_DISTANCE`, `MQ_MIN_ANGLE` with no bound, the 4-connected overshoot and holes, islands, `MQ_TRACE_DEVIATION`, region rows with no region; and in the refinement every row but `MQ_MAX_EDGE` and `MQ_TRANSITION` | 5 % / 4 %; 11 % with-region T, 23 % with-region TS, 5–17 % the others, 29–33 % ramp | the first blocking row and its name, and the refinement's target edge, equal to the full measurement's on every step; the carried step rasters only change cost (#1246's rule) | medium: a second measurement path held equal to the first, the shape of `MQ65`/`MQ68` |
| **C4 — the residual's veto stops at the first sample over the bound** | the rest of a vetoed trial's search; the refusal named by a thunk that runs the trial whole, as the floor's is | ≤ 24 % of demo/bottomwear TS (vetoed trials' search and rollback, 2,767 ms), ≤ 31 % sample/bottomwear TS, 5–15 % the other TS calls; by the `check` reading the first crossing comes after 3.7–31 % of the affected samples, so most of that bound | a partial trial rolled back to exactly the state before it; the veto text read lazily equal to today's; `MQ135`'s carried-against-full checks | medium; envelope-dependent: the stand-in vetoes 486 of 492 single trials on demo/bottomwear |
| **C5 — the source's terms as typed arrays** | per-sample `SampleTerms` objects in the carried state | memory: 315 → ~129 MiB live on demo/bottomwear (the doubles `memoryBytes()` counts); time: inside the residual's 17 % of TS self time, the allocation's part not separable here | the same arithmetic in the same order, so the same bits | low-medium |
| **C6 — the result's row reads the carried source side** | the result's `uvCarriers` over the source and the source's `termsAt` per sample: the same function of the same source, samples and envelope as the carried state's, computed once more | ≤ 3 % demo/bottomwear TS (357 ms of the row's 761), 10 % with-region TS, 1–4 % the rest | identical by construction; the candidate side is not reused (below) | low |
| **C7 — Δ with a declared region** | found here, not in the card's list: `MQ_ALLOCATION_CONTRAST` on the result costs 1,281 ms (with-region TA) and 2,147 ms (with-region TSA, 798 vertices) against 25 ms without a region | 11 % / 43 % of those calls; 0 without a region | its inner split is not measured here — profile `allocationContrast`'s region term first | unknown until then |
| **K1 — the comparison's reference not compared with itself point by point** | the reference's per-sample distance loop, whose every value is 0 by construction (the worst is the first sample both carry, at 0) | 34–37 % of a comparison | the reference's rows and per-frame table equal; stretch and reversal still measured | low |

**Rejected, each with its reason.**

- **The `uvCarriers` grid cell.** At 1, 2, 4 (the tree's), 8, 16 and 32
  samples per cell the carriers are identical on every subject (16 searches,
  8 inputs × source and T result), and the time moves within the run-to-run
  spread: 33–55 ms on demo/bottomwear's source, under 13 ms elsewhere. Every
  `uvCarriers` call of a TS call together is 0.9–5.3 % of it. No lever.
- **The post-pass's measurement.** Under 100 ms and at most 3.5 % of any call.
  Not worth a card on its own; C3 covers its unread rows.
- **Sample-domain reuse across the final measurements.** The samples are
  rebuilt by the admission's contract, the carried state and the result's
  row — 15–26 ms each on demo/bottomwear. Folded into C6 if wanted.
- **A floor for `MQ_COVERAGE`.** It would refuse on the ramp, where coverage
  refuses 220 attempts (52–62 % of the call), and on no recorded input, where
  no attempt is refused by coverage. A cut aimed at a fixture's mechanism.
- **The result's row from the carried candidate side.** Not identical by
  construction: the carried values are summed in the working mesh's corner
  order and the measurement's in the canonical mesh's, which #1295 declares
  differs by up to 1e-14 px, and the row's `r6` value and worst sample could
  move with it.
- **Coverage carried across interior removals.** That an interior removal
  never flips a pixel centre was observed for insertions (#1253), not proven
  for the centre test's ties; a skipped coverage would be a value, not a cost.
- **The comparison's reference prepared once across the dependant's seven
  calls.** It needs a new entry or a held reference — an interface for parts
  to agree to, not a cut inside one call.
- **Anything that moves a bound, a budget, the floor's margin, a sample count
  or a frame rate.** Out of scope by the card.

### Recommended order

1. **C1** — the largest bound on T, the policy every dependant call now runs,
   and the only one a representation change alone delivers; it also lowers
   C2's and C4's denominators, so measure them again after it.
2. **C2** — then the floor-decided attempts cost their floor; its proof
   obligation is already measured on the population.
3. **C4** — the TS calls' largest term after C1–C2; its bound depends on the
   envelope, so its before/after pair should also be read on parts's.
4. **C3**, then **C6** and **K1** — smaller, independent, each byte-identical
   by construction or by a held-equal second path.
5. **C5** and **C7** — after a finer profile: C5's time share and C7's inner
   split are not separable from these readings.

### Reproducing

In the stage-A record for #1304, from a clone at `5e8acd6` and the stage-D1
record's inputs:

```sh
python3 make_instr.py <tree> <copy>        # the instrumented copy
bash mkbundle.sh <bundle>                  # tree copy, instrumented copy, the recorded inputs, the harness
cd <bundle>                                # then, on the Nova pool runner (pooled, never exclusive):
bash batch.sh identity                     # tree / copy off / copy on, one hash each, 87 calls
bash batch.sh check                        # the predicted floor and the veto's first crossing (RIGC1304_CHECK=1)
bash batch.sh time                         # 3 tree + 3 instrumented runs per call, one process each, alternated
bash batch.sh prof                         # bun --cpu-prof-md over the tree, demo/bottomwear T and TS, with-region T
bash batch.sh compare                      # compareMeshesInMotion on MQ79's and MQ85's fixtures
bash batch.sh uvc                          # uvCarriers at 1–32 samples per cell, carriers hashed
bun mem.ts <bundle> <input>…               # live heap of each carried structure
```

The fixtures are `selftest.ts`'s own (`mvSource`, `mvBuild`, `abSource`,
`abBuild`, `mqMask`, `mqFrame` and the suite's input policy), extracted by line
range, not rewritten.


### §9's C1 — edge sets without strings, built only where read [implemented, #1307]

[implemented, #1307] What changed is the representation of the edge sets on
the removal and boundary-run paths (`src/meshreduce.ts`), and where they are
built:

- **Keyed by number.** An undirected edge is `pairKey(a, b, n)` = `min * n +
  max` over the ids below `n` — exact for any `n` up to 94,906,265 — in a
  `Set<number>`, where `edgeKey` built a string per edge. The source's edge set
  the steps read (condition (b)'s source-edge exemption, the post-pass's) is
  keyed the same way over the source vertex count; `protectionOf` still reads
  the string-keyed set once per call, because the weightJump edges it protects
  follow that set's sorted keys and their order names the first protected edge
  a step loses.
- **A run builds no per-removal edge set.** `removalStep` makes one removal's
  triangles; `removalOf` adds the edges it added, and `runRemovalOf` reads what
  the whole run added off the triangles its removals made — a triangle no
  removal made is the same tuple as one before the run, so every edge it holds
  is old and it adds nothing. Only the keys the new triangles hold are looked
  up among the old ones.
- **Built only where read.** The added edges are a thunk, built by condition
  (b) when `weightJump` is declared and by the load order (whose maximum reads
  no order); the triangulation's edge set is built only when a protected edge
  is looked up in it. Where order is read it is the order before: the added
  edges triangle by triangle, corner k to k + 1, so condition (b) names the
  same first edge over the jump; the protected edges in their own list's
  order, unchanged.

No candidate, order, row, bound, budget or message moves, and the observer's
`AttemptRecord`s are the same records.

**Byte identity** [measured, #1307]. §9's population — the 19 recorded inputs
(the stage-D1 record's 18 and #1253's with-region input), `MQ79`'s ramp and
`MQ85`'s traced bean, each under `rec`, T, TS, TA and TSA, the nine unweighted
synthetic inputs taking no envelope — through `reduceMesh` on main (`6458e15`)
and on the cut, and through the cut again under the edge-set audit below:
`writeMeshQualityReport(report)` and the mesh hashed, **identical on 87 of
87 calls**, 18 skipped; the audit compared 17,968 added-edge lists (45,072
edges, 13,724 of two or more) and found no difference. No recorded input
declares `weightJump`, so none reads condition (b) or the protected-edge set;
the same run under T with `protect.weightJump` 0.5 on the twelve weighted
inputs — beyond the population — is identical on **12 of 12**, the audit
comparing 17,425 added-edge lists and 10,571 triangulation edge sets (9.9
million edges) with no difference. The `mesh-quality` and `mesh-compare`
suites print the same text on main and the cut (Nova, `--jobs 4`) but for the
wall-time clauses (`MQ18`, `MQ24`, `MQ43`, `MQ46`–`MQ48`, `MQ55`) and
`MQ150`'s three lines.

**Cost** [measured, #1307]. Nova pool (WSL2 Linux 6.6, x86_64, 20 threads,
Bun 1.4.2), pooled rather than exclusive, the 1-minute load **2.4–8.4 (median
4.0)** at the calls' starts — above §9's 1.0–2.5, other pool jobs running
beside it. Each call in its own process, main and the cut alternated, three
of each; the median, ms; every call of a pair wrote the same hash:

| input | T main | T cut | saved | TS main | TS cut | saved | §9's bound, T / TS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| demo/neck | 77 | 63 | 18 % | 124 | 99 | 20 % | 15–27 % (necks) |
| sample/neck | 130 | 99 | 24 % | 187 | 146 | 22 % | 15–27 % (necks) |
| `scarf__hair_front` | 289 | 160 | 45 % | 641 | 379 | 41 % | 41–46 % / 10–41 % |
| sample/topwear | 393 | 228 | 42 % | 806 | 565 | 30 % | 41–46 % / 10–41 % |
| `scarf__handwear_l` | 1,126 | 561 | 50 % | 2,167 | 1,292 | 40 % | 41–46 % / 10–41 % |
| sample/sleeves | 1,575 | 842 | 47 % | 2,112 | 1,297 | 39 % | 41–46 % / 10–41 % |
| sample/bottomwear | 877 | 500 | 43 % | 2,483 | 1,813 | 27 % | 41–46 % / 10–41 % |
| demo/bottomwear | 4,052 | 1,767 | **56 %** | 10,842 | 6,633 | **39 %** | **54 % / 38 %** |
| `demo__bottomwear__region` | 10,492 | 5,327 | 49 % | 2,806 | 2,809 | 0 % | 41–46 % / — |
| `MQ79` ramp | 413 | 318 | 23 % | 468 | 384 | 18 % | 22 % / — |
| `MQ85` bean | 825 | 394 | 52 % | 2,438 | 1,395 | 43 % | 48 % / — |

- **At the bound or up to four points over it** (demo/bottomwear 56 % against
  54 %, the bean 52 % against 48 %, `scarf__handwear_l` 50 % against 41–46 %).
  §9's bound is the time its section timers put on the work the cut removes; the cut
  also drops the strings that work allocated, and peak RSS under T fell
  327 → 265 MiB on demo/bottomwear and 403 → 350 MiB on the with-region input.
  That the excess over the bound is the collector's share of those strings is
  [estimate, #1307]: the reading is the RSS beside the wall, and the
  collector's time was not measured.
- **The with-region input under TS is unchanged**, as §9 predicts: the
  refined source reads over the residual bound and the call stops before any
  removal.
- **The synthetic inputs** save −5 to 17 % at 11–50 ms, within the
  spread; `synthetic__tiny_region_source_at_L0` (617 vertices) 1,398 →
  1,087 ms (22 %).
- The removed work also lowers C2's and C4's denominators, as §9's
  recommended order says; their bounds are to be measured again over this
  tree, not read off §9's table.

**Held in suite** by `MQ150` (the `mesh-compare` suite, numbered from 150 to
leave MQ144 onwards to #1302's controls): `reduceMeshWith`'s seventh argument,
an `EdgeSetAudit`, builds every added-edge list and every triangulation edge
set a second time the string-keyed way they were built before and compares
them — a list member for member and in order, a set member for member — on
two subjects under T that read both paths: `MQ85`'s bean at half its largest
source edge jump (1,460 lists, 1,035 sets, condition (b) refusing 173
attempts) and `MQ79`'s ramp at 1.5 times its own (1,646 lists; condition (b)
refusing 1,184). The audited calls write the unaudited calls' bytes. Its
plants are the audit's own: one edge dropped from every list and set, found
as 169 list and 151 set differences on the bean, and every list of two or
more reversed, 159 on the bean.

The method and scripts are the stage-A record's (#1304), reused for a pair
of trees rather than a tree and its instrumented copy:

```sh
bash mkbundle.sh <worktree> <bundle>     # main's src, the cut's src, the recorded inputs, the harness
cd <bundle>                              # then, on the Nova pool runner (pooled, never exclusive):
bash batch.sh identity                   # main / cut / cut under the audit, one hash each, 87 calls
VARIANTS=TJ bash batch.sh identity       # T with weightJump 0.5 on the weighted inputs
bash batch.sh time                       # 3 main + 3 cut runs per T and TS call, one process each, alternated
```

### §9's C2 — the deviation floor read before the structure [implemented, #1309]

[implemented, #1309] What changed is *when* the deviation floor is read
(`src/meshreduce.ts`), not what it reads or decides:

- **Read off the outline walk, before anything is built.** `earlyFloor` takes
  the current outline's canonical walk (`canonicalWalk`, cached per working
  triangulation), drops the removed vertices, and turns what remains the way
  `canonicalise` turns a hull (`turnedFromSmallest`, the one rule both now
  share): rotated to its smallest id, walked the other way when its signed area
  does not turn as the source's does. The floor is `deviationFloor`'s loop over
  that polygon. Whenever the structure passes, the candidate's outline is that
  walk, so the two floors read the same segments in the same order. A removal
  of no source-hull vertex reads 0 without the walk.
- **Refused through #1279's thunk.** An attempt the early floor refuses builds
  no removal, no added-edge list, no protected-edge set and no canonical
  candidate. Its refusal is the same thunk: read, it runs the full path in the
  state it was tried in, so it names the structure's reason when the structure
  would have refused first — the 3,907 attempts §9 counted — and the rows'
  otherwise.
- **What a reader sees is held, `decidedByFloor` included.** The observer's
  `decidedByFloor` still means what it meant: that the path before, which read
  the floor after every structural check, was decided by it. So it is false
  for those 3,907. It costs the structure once per floor-refused attempt, and
  only when an observer (a control) or the floor audit is attached; with
  neither it is never computed. `AttemptRecord`'s shape and every value in it
  are unchanged, and so are the candidates tried, their order, and every row,
  bound, budget and message; the floor is no longer read a second time after
  the structure, since the two are equal wherever the structure passes.
  `FLOOR_MARGIN` and the `floor-half-a-pixel-short` plant now apply to the
  early floor, the only one the call reads.

**Byte identity** [measured, #1309]. §9's population through `reduceMesh` on
main (`2412292`, C1 included) and on the cut, through the cut again with an
observer and the floor audit below, and through main with an observer:
`writeMeshQualityReport(report)` and the mesh hashed, **identical on 87 of 87
calls**, 18 skipped; the observers' records — every attempt's step, kind,
vertices, pass, predicted load, `decidedByFloor` and, where the floor did not
decide it, the refusal's name — identical on 87 of 87 (86,341 attempts, 69,247
read `decidedByFloor`). The audit read the floor on every one of the 86,341,
compared the early floor with the floor off the canonical candidate on the
**82,426** whose structure passes — 18 of them walked the other way — and found
them equal bit for bit and decided alike; of the **73,154** the early floor
refused, **3,907** are refused by the structure first and were named by it, as
§9 predicted to the attempt. The same run under T with `protect.weightJump`
0.5 on the twelve weighted inputs is identical on **12 of 12** (14,676
attempts, 13,205 refused early, 4,960 of them structurally) with no difference.
The `mesh-quality` and `mesh-compare` suites print the same text on main and
the cut (Nova) but for the wall-time clauses (`MQ46`, `MQ47`, `MQ48` on that
run), the `mesh-compare` summary's rss and children high-water, and
`MQ151`'s lines.

**The bound after C1** [measured, #1309]. A copy of the cut that, for every
attempt the early floor refuses, also builds and times the structure the path
before built for it — the work this cut removes, on the tree it removes it
from: **52 %** of a T call and **26 %** of a TS call on demo/bottomwear (§9
read 77 % / 52 % before C1), 42–48 % of T on sample/sleeves,
sample/bottomwear, sample/topwear, `scarf__hair_front` and the bean, 34–35 %
on `scarf__handwear_l` and the with-region input, 16–25 % on the necks, 9 % on
the ramp; under TS 8–36 % on the inputs that reach a removal. Same pool, the
load 2.18–2.39; each figure the median of three runs' shares.

**Cost** [measured, #1309]. Nova pool (WSL2 Linux 6.6, x86_64, 20 threads,
Bun 1.4.2), pooled rather than exclusive, the 1-minute load **2.08–2.52
(median 2.18)** at the calls' starts. Each call in its own process, main and
the cut alternated, three of each; the median, ms; every call of a pair wrote
the same hash (33 of 33):

| input | T main | T cut | saved | TS main | TS cut | saved | bound after C1, T / TS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| demo/neck | 53 | 48 | 9 % | 85 | 80 | 6 % | 16 % / 8 % |
| sample/neck | 76 | 65 | 15 % | 128 | 121 | 5 % | 25 % / 14 % |
| `scarf__hair_front` | 131 | 77 | 41 % | 344 | 243 | 29 % | 46 % / 32 % |
| sample/topwear | 198 | 118 | 40 % | 501 | 413 | 18 % | 44 % / 25 % |
| `scarf__handwear_l` | 506 | 351 | 31 % | 1,132 | 874 | 23 % | 34 % / 25 % |
| sample/sleeves | 743 | 421 | 43 % | 1,189 | 798 | 33 % | 48 % / 36 % |
| sample/bottomwear | 438 | 275 | 37 % | 1,653 | 1,423 | 14 % | 42 % / 17 % |
| demo/bottomwear | 1,662 | 845 | **49 %** | 5,983 | 4,672 | **22 %** | **52 % / 26 %** |
| `demo__bottomwear__region` | 5,134 | 3,564 | 31 % | 2,861 | 2,892 | −1 % | 35 % / 0 % |
| `MQ79` ramp | 345 | 317 | 8 % | 403 | 380 | 6 % | 9 % / 7 % |
| `MQ85` bean | 414 | 238 | 43 % | 1,441 | 962 | 33 % | 48 % / 35 % |

- **Every saving is at or under its bound**, 1–10 points below it: the cut
  keeps what the floor itself costs and the walk it reads (one canonical walk
  per mesh the steps leave). The necks and the ramp save least because their
  hulls are short and most of their attempts are taken or refused by a row.
- **The with-region input under TS is unchanged**, as for C1: it stops before
  any removal.
- **The synthetic inputs** save −1 to 18 % at 10–46 ms, within the spread;
  `synthetic__tiny_region_source_at_L0` 948 → 897 ms.
- Peak RSS fell with the work: 255 → 238 MiB on demo/bottomwear under T,
  362 → 341 MiB on the with-region input. Not a claim the cut makes.

**Held in suite** by `MQ151` (the `mesh-compare` suite; MQ150 is C1's and
MQ144 onwards #1302's): `reduceMeshWith`'s eighth argument, a `FloorAudit`,
runs the path before beside the early floor on every attempt the floor is read
on — every structural check, then the floor off the canonical candidate,
decided at `FLOOR_MARGIN` — and compares: the two floors bit for bit and their
decisions where the structure passes; where the early floor refuses an attempt
the structure refuses first, the name a reader is shown against the
structure's, and `decidedByFloor` against false. Two subjects under T:
`MQ85`'s bean (1,776 attempts, 1,693 compared, 1,641 refused early, 83 of them
structurally) and `MQ79`'s ramp (627, 572, 300, 55); the audited, observed
calls write the plain calls' bytes, and the observer's `decidedByFloor` count
equals the floor's own refusals with a passing structure. Its plants: the floor
read half a pixel short of the bound (`MQ96`'s), which changes the bean's bytes
(the ramp's hull sits within 0.08 px of its chords, as `MQ96` notes, so it has
to fire on one subject); and an early refusal named off the floor, never
reaching the structural check that would have refused first, found by the
audit as 83 differences on the bean and 55 on the ramp.

The method and scripts are C1's, with a third tree: the bound copy is the cut
patched by one exact-text edit (`make_bound.py`).

```sh
bash mkbundle.sh <worktree> <main meshreduce.ts> <bundle>  # main, the cut, the bound copy, the recorded inputs, the harness
cd <bundle>                                 # then, on the Nova pool runner (pooled, never exclusive):
bash batch.sh identity                      # main / cut / cut audited and observed / main observed, 87 calls
VARIANTS=TJ bash batch.sh identity          # T with weightJump 0.5 on the weighted inputs
bash batch.sh bound                         # the bound after C1: 3 runs per T and TS call
bash batch.sh time                          # 3 main + 3 cut runs per T and TS call, one process each, alternated
```

## 10. Mesh economy against the authored rig (#1302)

> **Stage A of [#1302](https://github.com/rig-c/core/issues/1302): measurement only.** No bound, budget, order,
> termination, base or emitted byte changes here. Four controls hold the decomposition's checkable claims on the
> public fixture (`MQ144`–`MQ147`, `mesh-compare`, *Stage A controls*). Marks as in §7 and §8:
> **[observed, rigc#1271]** is the consumer's figure as its card and follow-up state it, or a share derived from
> those reports — none re-measured, and no per-part figure of its private parts is written here;
> **[measured, #1302]** is a figure taken for this section, from the stage-A record for #1302 (scratch scripts that
> import the tree at `6458e15` and write nothing into it) or printed by the controls, with the machine beside it;
> **[assumed]** is §8's linear-blend motion stand-in (*Measured — bounded alternatives*: every bone pivots alone at
> the share-weighted centroid of the vertices it carries and turns ±5°; art samples on a stride-3 grid, even parity
> selection, odd held out), used where a part has no public rig.
>
> **The trial policy** is the consumer's: coverage 1, overshoot ≤ 3, undercut 0, `maxBoundaryDeviation` 1,
> influences `{ 4, 0 }`, budget 5000, `boundaryRuns: { maxVertices: 8 }`, `retriangulate: 'delaunay'`,
> `removalOrder: 'deformation-load'`; the replay is rig-parts's — `stopAfterAccepted` bisected between the source
> (0) and the full run, chosen on the `grid` frames, `irr` held out — and acceptance is local deformation ≤ 1 with no
> inversion. **The rewind loss** of a replay is the vertices the full run removed after the accepted step: the
> replay's count less the full run's. It is, by construction, the whole of the gap between a replay and the fully
> reduced result.

### The consumer's figures [observed, rigc#1271]

Over the 47 mapped meshes, the automatic candidate against the authored rig: **+72.56 % vertices (1961 → 3384),
+100.46 % triangles (2404 → 4819), +164.34 % bindings (4447 → 11755)**, every motion gate passing; the three
largest components +508 %, +573 %, +334 % in vertices. Read from the consumer's own per-part reports and stated
here only as shares of those totals:

- **The growth is 70 % interior, 30 % boundary** of the added vertices; on the three largest components, 89 %
  interior.
- **The boundary half is the removal-only floor.** On the parts the automatic path produced, about nine tenths of
  the boundary growth is B\* (§8, the fewest source-hull vertices an outline can keep under the art rows and the
  1 px deviation) standing above the authored boundary; the rest, about a tenth, is boundary kept above B\*.
- **The interior half is the rewind.** Every automatic part whose full reduction passed motion ended with **no
  interior vertex**, as every public input below does; all the interior growth is on the parts that were replayed,
  where the bisection settled early in the run (on the largest components, between a tenth and a quarter of the
  accepted operations). The consumer's reports do not carry the full run's count, so its rewind loss is bounded rather
  than read: at most the replayed parts' kept vertices less their B\*, which comes to about as many vertices as the
  whole 47-mesh gap.
- **The automatic source starts at about 3.3× the authored vertex count** (interior about 5.9×, boundary about
  2.2×), before any reduction.
- **Influences per vertex are the source's.** Authored about 2.3, the automatic source about 3.6 — already before
  any reduction — and the result the same; the reduction pruned no share on any part. A candidate the consumer had
  matched to the authored density, with weights generated the same way, carries about a third more influences per
  vertex than the authored rig. Of the +164 % bindings, the vertex count (+72.56 %) and the influences per vertex
  (+53.2 %, 2.27 → 3.47) take **56 % and 44 %** on a log scale (vertex count first: 44 % / 56 %; influences first:
  68 % / 32 % — the split depends on the order, the log share does not).

### Measured — the kept vertices, decomposed [measured, #1302]

Per input, under the trial policy: the source; B\* over the source hull (`MQ_BOUNDARY_NECESSARY`, read off the
reduction's own report); the relocated outline — §8's C2 method, each source hull vertex allowed 0, 0.5 or 0.9 px out
along its normal, the fewest-vertex outline under the same art rows and deviation; the full run and its motion; the
replay; and the replay's kept vertices in four buckets — **(a)** boundary at B\*, **(a′)** boundary above B\*, **(b)**
interior the motion cut leaves (the replay's interior less the full run's), **(c)** interior a static row keeps (the
full run's interior) — beside **the rewind loss** and its share of the kept vertices. The strict policy (no opt-in)
is the last column, as its replay's count with its rewind loss.

| input | source b/i (total), influences per vertex | B\* / relocated | full run b/i, motion px | replay step / ops: b/i (total) | (a) / (a′) / (b) / (c) | rewind loss (share of kept) | strict replay (rewind) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| §8's traced fixture (`MQ85`'s), posed | 107/129 (236), 1.44 | 100 / **74** | 100/0, 1.647442 — refused | 127 / 135: 100/8 (**108**) | 100 / 0 / 8 / 0 | 8 (7 %) | 191 (89) |
| `MQ79`'s ramp, posed | 52/95 (147), 1.90 | 28 / — | 28/0, 0.244563 — accepted | 107 / 107: 28/0 (28) | 28 / 0 / 0 / 0 | 0 | 53 (25) |
| demo/bottomwear [assumed motion] | 293/243 (536), 4.00 | 217 / 119 | 223/0, 12.52 — refused | 26 / 275: 230/243 (473) | 217 / 13 / 243 / 0 | 250 (53 %) | 526 (244) |
| sample/bottomwear [assumed] | 107/123 (230), 4.00 | 95 / 57 | 95/0, 4.94 — refused | 11 / 130: 98/116 (214) | 95 / 3 / 116 / 0 | 119 (56 %) | 230 (129) |
| sample/sleeves [assumed] | 198/33 (231), 4.00 | 166 / 89 | 166/0, 1.84 — refused | 23 / 50: 167/26 (193) | 166 / 1 / 26 / 0 | 27 (14 %) | 209 (19) |
| sample/topwear [assumed] | 66/76 (142), 2.00 | 59 / 44 | 59/0, 3.39 — refused | 69 / 78: 59/9 (68) | 59 / 0 / 9 / 0 | 9 (13 %) | 121 (58) |
| sample/neck [assumed] | 26/81 (107), 2.00 | 21 / 16 | 21/0, 0.52 — accepted | 83 / 83: 21/0 (21) | 21 / 0 / 0 / 0 | 0 | 57 (31) |
| demo/neck [assumed] | 14/75 (89), 2.00 | 14 / 11 | 14/0, 0.31 — accepted | 75 / 75: 14/0 (14) | 14 / 0 / 0 / 0 | 0 | 14 (0) |

(sample/hair_back is `invalid-input` at admission, as in D1; its source hull has B\* — not measured, no reduction
runs — and a relocated outline of 116 against 174 hull vertices.) Machines: the fixture's and the ramp's rows on
Nova's pool (WSL2, 20 threads, Bun 1.4.2, 1-minute load 1.0–5.7), the example parts in three pool jobs (load
0.7–1.9); every count is the tree's and repeats on any machine, and the fixture's row is printed by `MQ144` on darwin
(Apple M4, load 6–14) with the same figures.

What the table says, bucket by bucket:

- **(c) is zero everywhere.** No static row keeps an interior vertex: every full run under the trial policy ends
  with no interior vertex at all. In the fixture's last removal pass the only refusals are 800 boundary attempts
  (700 runs, 100 singles), every one `MQ_BOUNDARY_DEVIATION` decided by the deviation floor — fill distance,
  coverage, minimum angle and `weightJump` (b) refuse nothing in the trial policy (no `minAngle`, no `weightJump`
  declared). So the brief's bucket "interior kept by a static row before motion" is empty on these inputs.
- **(a′) is small.** The boundary sits at B\* or within 13 of it (demo/bottomwear, where the cut falls inside the
  boundary runs); over the six example parts, 17 of 589 boundary vertices kept are above B\*.
- **(b) is all of the interior, and the rewind loss is all of the excess.** Where the full run passes motion (the
  ramp, the two necks) nothing is lost; where it fails, the replay keeps every interior vertex the full run would
  have removed after the step — on the two bottomwears that is the entire source interior or nearly (243 of 243,
  116 of 123), because the stand-in fails already inside the boundary runs that come first in the order. Over the six
  example parts the rewind loss is **405 of 983 kept vertices (41 %)**; on the fixture 8 of 108 under the trial
  policy, against 89 of 191 under the strict one.
- **(a) is the dependant's sampling held to its own tolerance.** B\* is removal-only: the outline can keep only
  source hull vertices, and a hull traced and simplified at 1 px against a 1 px deviation leaves most of them
  necessary (§8 *What holds the boundary*). An outline whose vertices may move ≤ 0.9 px out goes from 100 to **74**
  on the fixture and from 572 to 336 summed over the six example parts (−41 %), under the same art rows and the same
  deviation.

**The multi-interval search and the post-pass recover little here.** On the fixture the trial walk's first failure
is step 119 and its last pass step 127 — the bisection found the last pass, with 4 passing steps after the first
failure; the post-pass is already in the policy. A greedy thinning of the chosen replay's own vertex set with motion
in the loop (§8's C0 method, 11 trials) leaves 100/3 (103): 5 of the 8 interior vertices were not needed. On the
example parts the bisection is the search; a full walk was not run on the two bottomwears (it is what exhausted the
first pool job's hour).

**Correction to the brief.** "191 / 132 with opt-ins on the traced fixture": 191 is the strict replay (`MQ88`); 133
is boundary runs with the post-pass and **without** the load order (§8's *bounded alternatives*, re-measured here:
step 102 of 135, 100/33). With all three opt-ins — the trial policy — the fixture's replay keeps **108** (`MQ144`).
The decision rule's baseline on this fixture is therefore 108, not 132.

### Measured — bindings [measured, #1302]

- **The reduction never changes a kept vertex's bindings.** §6 applies `InfluenceLimits` to interpolated weights
  only, and a reduction that inserts nothing interpolates none: under the trial policy with `influences:
  { maxInfluences: 1, minWeight: 0.5 }` declared, the fixture's result carries the source's bindings on every kept
  vertex (137, the same as under `{ 4, 0 }`), and a kept vertex has 2 influences against the declared 1 (`MQ147`).
  On the example parts the same holds — a result's influences per vertex are its source's (4.00 on both bottomwears
  and sleeves, 2.00 elsewhere). So the binding count of a result is its vertex count times the influences the
  dependant's weights carry, and only the first factor is the reduction's.
- **Pruning on the dependant's side, before the call** (the strongest `max` shares kept, shares under `minWeight`
  dropped, renormalised on the 6-decimal grid), judged by the stand-in against the **unpruned** source [assumed]:

  | input | source bindings: as given / max 2 / min 0.1 / both | the pruned source itself against the unpruned, px: max 2 / min 0.1 / both |
  | --- | --- | --- |
  | demo/bottomwear | 2144 / 1072 / 1612 / 1022 | 6.23 / 3.14 / 6.23 — refused |
  | sample/bottomwear | 920 / 460 / 660 / 432 | 3.44 / 1.44 / 3.44 — refused |
  | sample/sleeves | 924 / 462 / 556 / 429 | 2.42 / 1.73 / 2.42 — refused |
  | sample/topwear | 284 / 284 / 226 / 226 | 0 / 1.13 / 1.13 |
  | sample/neck | 214 / 214 / 178 / 178 | 0 / 0.31 / 0.31 |
  | demo/neck | 178 / 178 / 151 / 151 | 0 / 0.22 / 0.22 |

  Max 2 halves the bindings of the four-influence parts and moves the unreduced source itself 2.4–6.2 px under the
  stand-in: the motion bound, held against the source, refuses the pruning before any vertex is removed. Where
  pruning passes (the necks), the trial results' bindings fall by the same share (28 → 25, 42 → 34) at the same
  vertex count. So a declared influence limit is a weight-field decision the comparison can only judge against a
  reference that has it too; it is not a lever the reduction holds.

### Measured — the floor [measured, #1302]

On the fixture, the smallest meshes found that pass every static row of `measureMeshQuality` against the source hull
and motion over every frame at the trial's bounds, posed:

| construction | b/i (total) | bindings | motion, grid / irr px |
| --- | --- | --- | --- |
| the trial replay (for comparison) | 100/8 (108) | 153 | 0.837721 / 0.784423 |
| B\* outline + one vertex on the centre line at each joint | 100/2 (102) | 141 | 0.713167 / 0.667798 |
| relocated outline (0, 0.5, 0.9 px) + the two joint vertices | **74/2 (76)** | **108** | 0.720679 / 0.674837 (`MQ145`) |
| relocated outline (0, 0.3, 0.6, 0.9 px) + the two joint vertices | **73/2 (75)** | 106 | 0.720679 / 0.674837 |
| either relocated outline, no interior | 74/0, 73/0 | — | 1.624318, 1.270209 — refused |
| either outline + greedy thinning from the source grid (§8's C1/C2) | 100/3, 74/3, 73/3 | 143, 109, 108 | 0.867748–0.872558 |

The joint vertices take positions the source does not have (the field is exact there because it depends on x
alone); greedy thinning over the source's grid needs one vertex more. So the floor on the fixture is **75–76
vertices, 106–108 bindings**, against the trial's 108 and 153: of the 32–33 vertices between them, 26–27 are
the outline (removal-only against relocation) and 6 the interior (the rewind against two joint vertices).

**The authored-like density on the example parts.** No public authored reference exists, so the target is the
card's aggregate ratio — authored over automatic, 1961 / 3384 = 0.5795 — times the trial replay's count on each
part. Feasibility under the declared bounds:

| input | target | the bound that refuses it |
| --- | --- | --- |
| demo/neck | 8 | `MQ_BOUNDARY_DEVIATION` (with the art rows): B\* is 14, a relocated outline 11 |
| sample/neck | 12 | `MQ_BOUNDARY_DEVIATION`: B\* 21, relocated 16 |
| sample/topwear | 39 | `MQ_BOUNDARY_DEVIATION`: B\* 59, relocated 44 |
| sample/sleeves | 112 | `MQ_BOUNDARY_DEVIATION` for a removal-only outline (B\* 166); a relocated one (89) fits, and was not built further |
| sample/bottomwear | 124 | motion [assumed]: B\*'s 95 plus 29, 44 or 58 interior vertices protected (farthest-point or by weight gradient), the rest reduced, reads 1.92–3.55 px |
| demo/bottomwear | 274 | motion [assumed]: 223 plus 51, 77 or 102 protected, 4.37–8.17 px |

So on the public inputs the authored-like density is not reached under the declared bounds by any construction
tried: on the four smaller parts the outline alone is over the target (even relocated on three), and on the two
bottomwears the dependant's four-influence weight field, held to 1 px against itself, needs more interior than the
target leaves — under the stand-in, which is not the consumer's rig.

### Measured — the joint-proximity control [measured, #1302]

The HQ's pre-registered rule needs a baseline: density-only regions (`RefinementRegion`, no bone) at the joints, at a
stated count. On the fixture, **2 regions** (one square per joint, centred on the centre line), transition 0, the
trial policy otherwise:

| regions | full run | accepted without a rewind | kept b/i (total), bindings |
| --- | --- | --- | --- |
| none (the trial replay) | 100/0, refused | no — step 127 | 100/8 (108), 153 |
| at the joints, half-size 4 px, `maxEdgeLength` 40 | 100/4, 0.844792 | **yes** | **100/4 (104)**, 145 |
| at the joints, half-size 4 px, `maxEdgeLength` 60 or 90 | 100/5, 0.835528 | yes | 100/5 (105), 147 |
| at the joints, half-size 20 / 30 / 40 px, `maxEdgeLength` 26–40 | accepted | yes | 132 / 149 / 174 |
| the same squares in the rigid zones, half-size 4 px, `maxEdgeLength` 40 | 100/24 at the step, refused full | no — step 111 | 100/24 (124), 178 |
| the same squares in the rigid zones, half-size 20–40 px | refused full | no | 137–172 |

On `MQ79`'s ramp the full run already passes, and one region anywhere only adds vertices (42–63 against 28).
Machines: the larger regions on Nova's pool (load 1.7–3.9), the 4 px regions on darwin (Apple M4, load 6–14).

**So the joint-proximity control at 2 regions reads 104 against the trial's 108**: it removes the rewind (the full
run is accepted) at the price of holding 4 interior vertices where the floor needs 2, and the same squares placed in
the rigid zones read 124 — on this fixture placement matters, which the HQ's random-placement measurement on a
private part did not find there. The mechanism is the one the HQ named: a region changes where the full run halts so
that it passes and nothing is rewound. A region larger than its need only buys density (132–174).

### Which side holds which share

The source's density, its weights and the hull's sampling are the dependant's inputs; the search, its operations and
the rows are rigc's. On the fixture, between the trial's 108 and the floor's 76 (32 vertices, 45 bindings):

- **26 vertices (81 %) are the outline**, and they are rigc's operation set more than anyone's input: a removal-only
  reduction cannot reach an outline whose vertices sit off the source's samples, and #1271 measured that sampling the
  hull finer makes it worse (§8, the correction to Q1). Relocation was declined in §8 Q5 for deform-key and weight-
  transfer reasons that do not apply to an automatic mesh with no `vertices` deform key.
- **6 vertices (19 %) are the rewind**, and the rewind is the replay protocol's: rigc's `stopAfterAccepted` makes a
  prefix the only thing a failed full run can be cut back to, and parts's bisection picks the prefix.
- **Bindings**: 45 more on the trial result (153 against 108), all from the vertex count — the fixture's field
  carries one or two influences everywhere, and every kept vertex keeps the source's.

On the consumer's 47 meshes, stated as shares of the card's totals:

- **About 70 % (the interior) is the rewind** — rigc's replay protocol, cut by parts's search. Every public input
  agrees: (c) is empty and (b) is the rewind loss.
- **About 30 % (the boundary) is the removal-only floor over a 1 px hull at a 1 px bound** — the two-tolerance
  mechanism of §8; the declared bound and the sampling are the dependant's, the absence of a relocating operation is
  rigc's.
- **Of the bindings, 44 % (log share) is the influences per vertex, which is the dependant's alone**: its weights carry
  about half again the authored influences per vertex before the reduction runs, and the reduction cannot change them
  (`MQ147`). The other 56 % follows the vertex count.
- **The start density is the dependant's, and it matters through the rewind**: a rewound replay keeps source vertices,
  so a source at 3.3× the authored count leaves a rewind that much denser.

The follow-up is therefore cut on rigc's side first, in this order: the rewind (whatever stops a failed full run
from keeping every later-removed vertex), then the outline (a relocating boundary operation for meshes with no
deform keys); the influence count is a question for the dependant's weight generator, not for the reduction.

### Measured — what a localised fallback would need from the comparison [measured, #1302]

The HQ's first candidate mechanism protects only the vertices of the samples or triangles that broke the bound and
lets the rest reduce to the end. The reduction already takes the protection: `protect.vertices` keeps any set of
source vertices through every pass (the floor constructions above use it). What is missing is the input to choose
the set: a comparison's `MQ_LOCAL_DEFORMATION` row reports **one** worst sample — its pixel and UV, not the
candidate triangle that carries it — at one frame, per role and per phase; `perFrame` adds a value per frame with no
location; `MQ_INVERSION` names one triangle. The comparison computes every sample's carrier and distance in each
frame and keeps only the maximum. A localised fallback would need, per failing candidate, the samples over the bound
(or the per-triangle maximum over the selection frames) with the candidate's carrying triangle — an opt-in report
field, since a full list is as large as the art. On the fixture the size of the prize is small (the rewind is 8 of
108); on the example parts it is 41 % of the kept vertices under the stand-in, and on demo/bottomwear the first
failure falls inside the boundary runs, so the set to protect there would be boundary vertices, not interior ones.

### Implemented — the over-bound report [implemented, #1315]

**What the comparison now carries.** `MotionComparisonInput.overBound?: { maxSamples, triangles }` (§2, the schema)
asks each candidate's report for an `overBound` block: for `MQ_LOCAL_DEFORMATION`'s attachment row and each measured
region's, **every sample whose worst distance over the frames walked fails the bound is counted** (`total`), and at most
`maxSamples` are listed worst first — each by its §3 id (an art pixel or a reference hull vertex) and UV, the frame of
its worst value with its role (selection, held out or baseline), the value, and **the candidate's UV triangle that
carries it**, by index and by its three vertex indices; and, per attachment, **each triangle's worst value of every
declared motion row over the selection frames** (`MQ_INVERSION`: the selection frames it is reversed at;
`MQ_LOCAL_DEFORMATION`: the largest distance of a sample it carries; `MQ_SQUASH` / `MQ_STRETCH`: its singular values),
the over-bound triangles or, with `triangles: 'all'`, every triangle with a reading. The carriers are the ones the row
was already computed from; the block is bookkeeping beside them, and nothing else moves — no row, verdict, acceptance
or byte of a call without the field. `MQ_INVERSION`'s worst triangle on the row stays as it was. Held by `MQ152`–`MQ155`
(*Stage A controls*).

**Measured — the localisation premise does not hold as stated [measured, #1315].** The card's control (a) was that the
source vertices the over-bound samples' triangles span are a strict subset of the vertices the rewind keeps (the
replay's kept set less the full run's). On the fixture, the trial policy's full run (100/0, refused at 1.647442) has
**878 samples over the bound, carried by 4 of its triangles**, which span **8 source vertices — all boundary — and 0 of
the rewind's 8** (the rewind keeps interior source vertices 123, 141, 161, 168, 182, 189, 203, 210). The intersection
is empty by construction rather than by measurement: a candidate's triangles span only vertices that candidate kept,
and the rewind's set is by its definition what the full run removed. So control (a) was not written.

Read spatially instead — the source vertices whose UV lies inside those 4 triangles — the over-bound region holds **24
source vertices, 15 of them interior, and only 3 of the rewind's 8**. Protecting those 15 (`protect.vertices`, the trial
policy otherwise) gives **100/15 (115), which still fails motion at 1.380337 px**; protecting the rewind's 8 gives 100/8
(108), accepted at 0.837721 px — the replay's count. On this fixture, then, the vertices motion needs are not the ones
under the broken art: 5 of the 8 lie outside the over-bound triangles. A localised retry that protects what lies under
the over-bound samples protects more than the rewind and still fails, so the next card cannot take this set as its
protection unchanged. (Machine: darwin, Apple M4, load 25–30; every count is the tree's.)

**Opt-out bytes [measured, #1315].** Every call the `mesh-compare` suite makes without the field was run
through both trees — this one and `5896cc7`, the tree before it — and the two texts compared: **165 of 165 the same**,
123 posed comparisons (one of them under a #1291 amplitude plant), 19 with no schedule (three under #1291's plants),
and 23 refusals with the same code and message — every fixture the suite poses, on darwin; the unit-by-unit split was
not recorded. The stage-D1 record cannot widen this: its inputs carry no rig, so nothing there can be posed. In
suite, `MQ154` holds the shape of that comparison on the fixture and the ramp.

**Cost [measured, #1315].** `MQ154`'s two calls, with and without the field (with it: `maxSamples` 3),
three calls each per process, three processes per mode alternated, on Nova's pool (WSL2, 20 threads, Bun 1.4.2, load
0.3–0.7); the medians of the three per-process medians, the report's text written in each:

| subject | frames | without | with | per frame |
| --- | --- | --- | --- | --- |
| the trial full run, grid selected | 99 | 598.5 ms | 657.3 ms | 6.05 → 6.64 ms (+9.8 %) |
| `MQ79`'s strict result, all held out | 50 | 42.8 ms | 48.9 ms | 0.856 → 0.978 ms (+14 %) |

Peak resident set per process 369–381 MB without and 364–377 MB with — the field's arrays (12 bytes a sample and 38 a
triangle, made only when asked) are below the spread between runs. The same pairs on darwin (Apple M4, load 17–26)
moved by up to 3× between runs of one mode and are not stated. So the bookkeeping is not free: about a tenth on the
call, from the two typed-array writes it adds to every sample at every frame; a call without the field skips all of
it.

### What #155's density-only regions need from rigc

`RefinementRegion` as it stands is enough to test a field: a polygon with a `maxEdgeLength` is a density floor
inside it with no bone, the reduction honours it, and the post-pass never flips an edge it holds (`MQ102`). The joint
control above is that test, built from the tree as it is. What a comparison between fields needs and the reports do
not carry, all derivable by the caller today but not reported: the kept vertices inside each region and its band
against those outside; whether the full run was accepted (the termination says `replayed-to-accepted-step` only for
a replay) and, for a replay, the rewind loss — which needs the full run's count, which only a caller that ran the
full run has. A shading-gradient field cannot be tested on the public fixture: its plates are checkerboards with
`PLACEHOLDER` burned in, with no shading to take a gradient of.

### Questions for rig-parts and the HQ

Numbered afresh for #1302; cited as "§10 Q1" and so on.

- **Q1.** The rewind loss on the consumer's parts is bounded here, not read: its reports keep the chosen replay and
  not the full run's counts. Will rig-parts record, per replayed part, the full run's boundary/interior and the
  replay's, so the rewind loss and buckets (a)–(c) can be read on the 47 meshes (and A–E) rather than bounded?
- **Q2.** Do the consumer's authored meshes qualify under the trial's bounds as candidates (`compareMeshesInMotion`
  is topology-independent; they can be measured today), and what is their motion error against the automatic source?
  The authored-density targets here are refused on every public part, which says nothing about the authored meshes
  themselves.
- **Q3.** A localised fallback needs the samples or triangles that broke the bound. Does rig-parts want an opt-in
  field on the comparison's report carrying them (per failing candidate: samples over the bound with their carrying
  triangle, or a per-triangle maximum over the selection frames), and would it then drive `protect.vertices` itself?
  *The field exists since #1315 (`overBound`); on the fixture the vertices under the over-bound triangles are not the
  ones motion needs (*Implemented — the over-bound report*), so the second half stands open.*
- **Q4.** Relocation (§8 Q5) was declined for deform keys and weight transfer. For automatic meshes, which carry no
  `vertices` deform key and whose weights the dependant generates from a field, is a relocating boundary operation
  reconsidered — 26 of the 32 vertices between the fixture's trial result and its floor?
- **Q5.** Is a coarser source or a declared influence limit on rig-parts's side? Pruning to 2 influences halves the
  bindings of the four-influence example parts and is refused by the motion bound against the unpruned source
  (2.4–6.2 px [assumed]) before any reduction: if the limit is wanted, the reference has to carry it too.
- **Q6 (HQ).** On the fixture the joint-proximity control (2 regions, 104) beats the same regions in the rigid zones
  (124), unlike the random placements measured on the private part. Is the decision rule's baseline on the public
  fixture 108 (the trial replay) with the joint control at 104, and is the field to be tested against both?

### Measured — relocation [measured, #1318]

> **The relocating boundary operation of [#1318](https://github.com/rig-c/core/issues/1318) is on hold, and only
> its first measurement is written here.** The consumer raised its declared source tolerance from 1 to 2 px, with the
> margin and the deviation bound alongside, and its two parts' hulls went from 108/102 to 40/38 against the authored
> 39/40, every cell passing motion **[observed, rig HQ]**. Most of what a relocation inside a 1 px bound was to buy
> is therefore bought by one declared value on the dependant's side, so the remaining stage A items (the position
> rule, the weights and UVs of a relocated vertex, replay semantics, motion) and the stage B operation are not
> measured or specified here. No bound, budget, row, emitted byte or control changes. Figures are from the stage-A
> record for #1318 (scratch scripts that import the tree at `5896cc7` and write nothing into it).

**Method.** §10's: the fewest-vertex closed outline over the source hull's own vertices, each allowed to sit at one
offset of a ladder along its outward normal (the bisector of its two edge normals); a chord is nominated when every
source hull vertex and edge sample it skips is within 1 px of it, every sample of it is within 1 px of the source
hull, and no art pixel centre lies between it and the arc it skips; a candidate outside the frame is not offered (it
would be `REDUCE_UV_RANGE`); the cycle is the exact shortest one over every start. The search only nominates:
every outline below was built (ear clipping, no interior) and measured by `measureMeshQuality` against the source
hull at the declared bounds — coverage 1, overshoot ≤ 3, undercut 0, `maxBoundaryDeviation` 1 — and every one
reported passes all of them. Ladders: **L1** 0 / 0.5 / 0.9 px (§10's), **L3** 0 to 0.9 by 0.1, and **Ls2** −0.9
to 0.9 by 0.3 (inward offsets too).

| input | hull | B\* | kept (trial replay, above) | relocated L1 | L3 | Ls2 (floor) | Ls2 against B\* | the row that stops it |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| §8's traced fixture (`MQ85`'s) | 107 | 100 | 100 | 74 | 71 | **64** | −36 % | `MQ_BOUNDARY_DEVIATION` |
| `MQ79`'s ramp | 52 | 28 | 28 | 12 | 12 | **12** | −57 % | art rows and the UV window (below) |
| demo/bottomwear | 293 | 217 | 230 | 119 | 116 | **98** | −55 % | `MQ_BOUNDARY_DEVIATION` |
| sample/bottomwear | 107 | 95 | 98 | 57 | 55 | **45** | −53 % | `MQ_BOUNDARY_DEVIATION` |
| sample/sleeves | 198 | 166 | 167 | 89 | 84 | **81** | −51 % | `MQ_BOUNDARY_DEVIATION` |
| sample/topwear | 66 | 59 | 59 | 44 | 43 | **40** | −32 % | `MQ_BOUNDARY_DEVIATION` |
| sample/neck | 26 | 21 | 21 | 16 | 16 | **15** | −29 % | `MQ_BOUNDARY_DEVIATION` |
| demo/neck | 14 | 14 | 14 | 11 | 10 | **10** | −29 % | `MQ_BOUNDARY_DEVIATION` |
| six example parts, summed | 704 | 572 | 589 | 336 | 324 | **289** | −49 % | |

(sample/hair_back's source already fails `MQ_OVERSHOOT` at 5.099 px, so it is not a reduction input; its outlines —
B\* 162 as measured on it, L1 116, Ls2 109 — inherit the failure.) On demo/neck and sample/neck the finer outward
ladder and the inward ladders tie (10, 15); there Ls2 is the floor only by equality.

- **The relocated floor is materially below B\* on every public input**: 572 → 336 summed with §10's ladder
  (reproduced), 324 with a ten-step outward ladder, **289 (−49 %)** once a vertex may also move inward. A finer
  outward ladder buys little (336 → 324); the inward half buys more (324 → 289), because on a traced hull that sits
  about a margin outside the art an inward move keeps the art covered while a chord cuts the other way.
- **The row that stops it is the deviation, not the art** — read by switching each family of local tests off at the
  floor's ladder and measuring what the search then finds. Without the deviation test the outline falls to 7–19
  vertices on every input but the ramp, refused `MQ_BOUNDARY_DEVIATION` at 2.85–46.7 px (and `MQ_OVERSHOOT`);
  without the art test it stays at
  the same count on every input but the ramp, refused `MQ_COVERAGE`/`MQ_UNDERCUT` or passing as it is — so the art
  rows shape where the floor's vertices go and the 1 px bound sets how many there are. The ramp is the exception:
  the deviation does not bind it (12 with the test off), the art test does (8 without it, `MQ_COVERAGE` 0.9774), and
  so does the frame — its straight ends are the window's edges, 52 of 156 L1 candidates lie outside it, and the L1
  search without the window finds 8, refused `REDUCE_UV_RANGE` (u −0.0043).

**The inverse — is the authored-like count reachable within 1 px?** Two targets on the trial replay's kept boundary:
§10's aggregate ratio (authored over automatic vertices, 1961 / 3384 = 0.5795), and the shape of the consumer's hull
gap (authored 39/40 against 108/102, about 0.376). For each: whether the floor reaches it at 1 px, and if not, the
smallest bound t at which an outline of that count exists (the same search, both deviation tests at t, ladder
0 / 0.5 t / 0.9 t — an upper bound, since that ladder is coarser than Ls2), with what the declared bounds then refuse.

| input | target at 0.5795 | at 1 px? | else t needed, refused by | target at 0.376 | at 1 px? | else t needed, refused by |
| --- | --- | --- | --- | --- | --- | --- |
| traced fixture | 58 | no (64) | 1.22 px — deviation 1.21 | 38 | no | 1.49 px — deviation 1.49 |
| `MQ79`'s ramp | 16 | **yes** (12) | — | 11 | no | 1.16 px — deviation 1.05 |
| demo/bottomwear | 133 | **yes** (98) | — | 87 | no | 1.22 px — deviation 1.21 |
| sample/bottomwear | 57 | **yes** (45) | — | 37 | no | 1.27 px — deviation 1.27 |
| sample/sleeves | 97 | **yes** (81) | — | 63 | no | 1.55 px — deviation 1.54 |
| sample/topwear | 34 | no (40) | 1.27 px — deviation 1.27 | 22 | no | 2.04 px — deviation 2.02, overshoot 3.61 |
| sample/neck | 12 | no (15) | 1.49 px — deviation 1.48 | 8 | no | 3.46 px — deviation 3.45, overshoot 4.00 |
| demo/neck | 8 | no (10) | 3.02 px — deviation 2.72, overshoot 4.12 | 5 | no | not at 8 px (6) |

So within the declared 1 px no input reaches the consumer-shaped hull count, and the refusing row is
`MQ_BOUNDARY_DEVIATION` everywhere; at §10's looser ratio the ramp and the three largest parts reach it by relocation
and the fixture, topwear and the two necks do not. On the larger parts the bound that would be needed is 1.2–1.6 px, and on
the small ones 2–3.5 px with `MQ_OVERSHOOT` (bound 3) refusing too — which is the same direction as the consumer's
measurement: the count is held by the declared tolerance, and moving that value is what moves it.

**Machine.** The fixture and the example parts in three Nova pool jobs (WSL2, 20 threads, Bun 1.4.2, 1-minute load
0.0–6.9); the ramp's row on darwin (Apple M4) after the window refusal was caught by name rather than thrown. Every
count is the search's and the tree's and repeats on any machine (the L1 search run twice per input, identical); the
largest search, Ls2 on demo/bottomwear, tested 574,280 chords in 26 s.

## 11. Interior feature lines (#1326)

> **Stage B ([#1326](https://github.com/rig-c/core/issues/1326), released by the HQ comment of 2026-10-10 with a
> narrower scope: no builder, nothing on `SourceMesh`) implements *The contract* below** — each clause marked
> **[implemented, #1326]** with what the tree does, controls `MQ166`–`MQ175`. Left out, `lines` changes no byte:
> measured against `d0f289b` on the 18 inputs of the stage-D1 record (as recorded, under the three opt-ins together,
> and each source measured — 54 of 54) and on Stage A's ten fixture calls (10 of 10), identical.
>
> **Stage A of [#1326](https://github.com/rig-c/core/issues/1326): measurement and contract, no mechanism.** No
> row, refusal, bound, budget, order, termination or emitted byte changes here. Four controls hold the current API's
> readings on a fixture built from rig-c alone (`MQ162`–`MQ165`, `mesh-quality`, *Stage A controls*). Marks as in
> §10: **[observed, rig-parts#160]** is the consumer's figure as its survey prints it (rig-parts PR #164,
> `tools/feature_contour_survey.ts`, `docs/evidence/auto-feature-contours.md`, run against rig-c 2.32.1);
> **[measured, #1326]** is a figure taken for this section — printed by the controls, or by the stage-A record's
> scratch scripts, which import this tree at v2.32.2 and the consumer's tool read-only and write nothing into either;
> **[proposal]** is rigc's answer to something nobody has agreed. Every reduction in this section runs the consumer's
> blink policy (coverage 1, overshoot ≤ 2, undercut 0, `maxBoundaryDeviation` 1, influences `{ 4, 0 }`, budget
> 2000) or its face policy (permissive: coverage 0.995, overshoot ≤ 3, undercut undeclared, budget 5000), with the
> skinning veto at 1 px unless a line says otherwise. 2.32.1 and 2.32.2 differ only in the comparison's carrier rule
> (#1323), which no figure here reads: the consumer's builds re-run on this tree reproduce its counts and displacements
> to the printed digit.

### The case and the gap

An eyelid closes over an opening: the lid's edge is a line inside the part, the lid bone's share falls across it,
and the motion carries one side onto the other. A mesh draws the edge where its triangles interpolate the share; the
**dense reference** is the share rule evaluated at every point, and a mesh's **edge displacement** is the largest
|w̄(p) − rule(p)|·|T| over samples every 0.25 px along the edge at the closed pose (rig-parts's definition,
re-implemented in `fixtures/blink.ts` as `edgeDisplacement`). No row reads the dense reference: `MQ_SKINNING_RESIDUAL`
and the motion comparison hold a candidate to its **source**, so a source that cannot put a vertex on the line passes
every gate with the edge wherever its lattice put it.

Existing, read on the tree: `protect.edges` takes any pair of source indices that is an edge of a source triangle
(`REDUCE_INPUT_MISSING` otherwise) and `protectionOf` adds both ends of each to the protected vertices — so a line
kept as edges keeps every vertex it has. `MQ_BOUNDARY_DEVIATION` lets the hull's vertices go under a bound. Nothing
lets a line's vertices go under one. That pair is the asymmetry the card names.

### The fixture [measured, #1326]

`fixtures/blink.ts` — the consumer's blink rebuilt from rig-c alone: a 56 × 40 block at (4, 4) in 64 × 48, one
24 × 6 hole at (20, 19), bones `root` and `lid`, the lid's share 1 at and above y = 19, 0 at and below y = 25 and
(25 − y)/6 between, T = (0, 6). It sits under `fixtures/` beside `polypack_shapes.ts` rather than inside the suite
because two readers measure the same object — the `mesh-quality` controls and the stage-A record's scripts — and a
module the suite owns cannot be imported without running the suite. Its sources are tensor grids (columns and rows,
two triangles a cell): lattices at 8 and 4 px, and the 8 px lattice with the ring's grid lines added, so every ring
edge is a grid edge **without a triangulator** — rig-c has none that takes an interior line (below). The line is every
grid vertex on the ring: 18 (the ring sampled at 4 px gives 16, and the lattice row y = 24 meets both sides).

| reading | source | line vertices kept | result | edge vs dense, px | rig-parts#160, same reading on its sources |
| --- | --- | --- | --- | --- | --- |
| (a) lattice 8, no line | 28+35 | — | 8+2 = 10 | **1.874999** (a(s − a)/s by hand: 1.875) | 8 vertices, 1.875 |
| (a) lattice 4, no line | 48+117 | — | 8+2 = 10 | **0.950002** (source 0.750002, 0.75 by hand) | 8 vertices, 0.95 |
| (b) the line as `protect.edges` | 42+88 | 18 of 18 | 8+19 = 27 | **0.000002** | 27 vertices, 0 |
| (c) the line's corners (`simplifyClosedPolygon` at 1 px, 4) in `protect.vertices` | 42+88 | 4 of 18 | 8+5 = 13 | **0.000001** | 16 vertices, 0 ((iv)) |
| (c), one corner left out, veto 1 px | 42+88 | 3 of 18 | 8+4 = 12 | 0.570001 | — |
| (c), one corner left out, veto absent | 42+88 | 3 of 18 | 4+3 = 7 | **3.931034**, accepted, every required row passing | — |

All accepted. The consumer's blink figures are **confirmed**: re-running its own exported inputs on this tree gives
its counts and displacements exactly (8 / 1.875, 8 / 0.95, 8 / 0.941176, 27 / 0, 16 / 0), and this tree's fixture
reproduces (a) and (b) to the digit and (c)'s displacement, with a different count for (c) (13, not 16) because the
source is a different construction. Two readings worth keeping: at 4 px the reduction moves the edge *further* from
the dense reference than its source had it (0.75 → 0.95), because the veto bounds drift from the source and nothing
bounds drift from the rule; and with one corner unprotected the kept chain sits **5.820855 px** from the removed
corner while the edge moves 0.570001 px under the veto — a line's geometric deviation and its displacement are
different quantities, and neither row today reads the first.

### The contract [proposal; implemented, #1326]

**Where a line lives — on the reduction input, not on `SourceMesh`.** [implemented, #1326 — `NamedLine`,
`MeshReductionInput.lines`, `MeshMeasureInput.lines`; echoed as `effective.lines`] `MeshReductionInput.lines?: NamedLine[]`, opt-in,
left out = the call it was before the field. A line is a declaration about how a reduction may change a source, the
same kind of thing as `protect` and `boundaryRuns`; `SourceMesh` is the mesh, whose fields every measurement and the
comparison read, and a field there would either be read by none of them or change what they hash
(`sourceMeshDigest`). The measurement takes the same array on `MeshMeasureInput` (as it takes `referenceHull`), so a
`measure` can report the row on a candidate against its source. **[implemented, #1326]** with one field the clause
leaves implicit: the indices are into the source, which a measurement is not otherwise handed, so it takes
`lineSource: { id, mesh }` beside `lines` — required with it and refused without it, echoed by id and
`sourceMeshDigest` as `skinning.source` is — and reads a line vertex as kept when the measured mesh has a vertex at its
exact position (a reduction never moves a survivor, P19). So one `lines` value serves both calls unchanged.

```ts
interface NamedLine {
  /** Caller's name, echoed; rigc reads nothing into it. Unique among the input's lines. */
  name: string;
  /** Source vertex indices in order along the line. */
  vertices: number[];
  /** Closed: the last joins the first. Open: two ends. */
  closed: boolean;
  /** The bound on MQ_LINE_DEVIATION, drawing px, finite, >= 0; required — no default. */
  maxDeviation: number;
}
```

**Refused by name, before any work, under one code: `REDUCE_INPUT_LINE`**, the detail naming the line, the index or
pair, and the rule — an index that is not a source vertex; a consecutive pair (and, closed, the last–first pair) that
is not an edge of a source triangle (the same test `protect.edges` applies); a vertex listed twice in one line; a
closed line with fewer than 3 vertices or an open one with fewer than 2; two lines with one name; a line whose
segments cross each other, or cross another line's, other than at a vertex both list; a line that leaves the outline
(any of its segments outside the source's hull polygon — a hull vertex on a line is allowed, a segment off the art is
not). A crossing is never resolved by the reducer: two lines that cross **must list the crossing as one shared source
vertex**, and two lines that overlap along a run (the sample face's eyewhites and lashes share 5 and 10 unit pixel
edges, below) must both list every vertex of the run. A self-crossing is refused rather than split.
**[implemented, #1326]** in that order (`validateLines`), with three readings the clause leaves open: `maxDeviation`
left out and `null` are each refused naming themselves (a line has no declared-absent form — a line held whole is
`protect.edges`); `null` for `lines` itself is refused as `boundaryRuns: null` is; and one rule is added — **a line
vertex whose position another source vertex shares** is refused, because the measurement reads a kept vertex by its
position and two vertices at one point would make the two operations disagree. The measurement refuses under the
same code and in the same words: it already refuses under the `REDUCE_` family (`REDUCE_MASK_SIZE`,
`REDUCE_UV_RANGE`), and no `MEASURE_` code exists, so a second family would split one rule across two names.
Since every listed pair must be a source edge, "crossing" and "off the outline" can only fire on a source whose edges
cross or leave its hull — a folded one; both are checked anyway, because validation runs before the admission
measurement that would refuse such a source. `MQ166` sees each rule red.

**`MQ_LINE_DEVIATION`**, one row per line, `object.region` null and `object.line` the name, `unit: 'px'`: the
**symmetric Hausdorff distance between the kept chain and the source polyline**, by the same function the boundary row
uses (`hausdorff` / `directedHausdorff`, exact to `HAUSDORFF_TOLERANCE` by bisection of each edge against the other
polyline's edge distances — not sampled), with an open line compared as an open polyline (no closing edge on either
side). The kept chain is the line's surviving vertices in their listed order. Drawing px: the row is geometric, so,
like `MQ_BOUNDARY_DEVIATION` and unlike the raster rows, it involves no `pageScale` conversion. Required, gating
like the boundary row. **[implemented, #1326]** as written (`lineDeviation`, `lineDeviationRows`): `hausdorff` gained
an open-polyline reading (no closing edge; one point is its own degenerate edge), the closed reading edge for edge as
before; the value is on the `r6` grid; the worst sample is the chain edge it belongs to, in the measured mesh's
indices; a mesh that keeps no vertex of a line reads `not-measurable`. Rows sort by code then region, and lines tie
there, so the stable sort leaves them in declared order (A18). A step's rows are read beside the measurement by the
same function rather than handed to it — validating the lines on every step would cost one O(segments²) crossing check
per candidate for nothing. Why that distance:

- One-sided, from the source polyline's samples to the kept chain, is what the issue's comment says the boundary row
  does. **It does not**: `MQ_BOUNDARY_DEVIATION` is two-sided and exact. For a reduction the two sides happen to agree
  per arc — the kept chain's vertices are a subsequence of the source line's, and an arc whose every point is within
  b of its chord projects onto the whole chord — but a measurement of an arbitrary candidate against a source (the
  `measure` operation) has no such guarantee, and the boundary row's convention covers both.
- Sampling every 0.25 px is the consumer's displacement reference, a different quantity (below); the exact distance
  needs no step and has no step to argue about.

**What a line protects, and the interactions:**

- A line's consecutive kept vertices are **edges of the result** — a step that would leave two consecutive kept line
  vertices unjoined is refused, as a protected edge is today, and the Delaunay post-pass flips no line edge. A line
  vertex may be removed only by a step whose result keeps the row within `maxDeviation` and joins its two kept
  neighbours by an edge — the line's own form of the hull's single removal. **[implemented, #1326]** The hole a line
  vertex leaves is cut along each chord its lines need before it is ear-clipped (`chordPieces`), so the join does not
  hang on which ear the clipper takes; a chord that is not a diagonal of the hole is refused by name (`line "…" (a):
  … cannot be joined`), and the edge check after the structure (`line "…" (a): … no longer joined`) names anything
  that misses (`MQ168`). The post-pass holds every kept line edge as a protected edge (`MQ170`). An open line's two
  ends are kept — a single removal there has one neighbour and no chord — and a closed line keeps three.
- The deviation floor (`earlyFloor`): its argument carries over unchanged — the backward half of the row evaluates
  every removed line vertex's distance to the kept chain exactly, so the furthest removed line vertex from the chain
  the attempt would leave is a lower bound on the row, and an attempt whose floor is over the bound is refused before
  any structure is built, named `MQ_LINE_DEVIATION`. **[implemented, #1326] — as the row itself, not a bound on it.**
  The row reads only the line vertices' positions, which an attempt fixes before anything is built, so the tree reads
  the whole row of every line the attempt touches there; a refusal is a thunk that, read, names what the full path
  names (structure first). Verdict-identical by construction, and measured: every result byte-identical against
  every candidate measured (`measure-every-candidate`) on four blink subjects in suite (`MQ175`) and on the sample
  face, singles and runs, out of suite.
- `boundaryRuns`: a run of 2 to `maxVertices` consecutive kept line vertices replaced by one chord, as one step,
  counted once in `acceptedAt` (`kind: 'line-run'`), is proposed on the same argument as the hull's — a line's
  single removals refuse one by one where a run would pass (a run of collinear-ish vertices whose chord is within the
  bound) — and governed by the same opt-in rather than a second one, since the setting is the longest chord a pass
  tries, not a property of the outline. **[implemented, #1326]** After each pass's boundary runs and before its single
  removals: lines in declared order, starts in listed order, runs longest first, never an end or a protected vertex,
  never leaving a closed line under three (`MQ169`; replay across them, `MQ174`).
- A line touching the outline: the shared vertex is a hull vertex and a line vertex. Both rules apply and **the
  stricter wins** — it can leave only by a step that keeps both rows in bound and both chains joined; `protect.hull`
  keeps it outright. A line vertex also in `protect.vertices` is kept; the line's chain still reads it.
  **[implemented, #1326]** (`MQ172`).
- A line's vertex that is a crossing or a run end (listed by two lines) is kept: removing it would make the two chains
  disagree about where they meet. **[implemented, #1326]** (`MQ171`) — measured, the protection is load-bearing at a run's end
  only: at a true crossing the two chords cross, so no triangulation of the hole holds both and the chord rule keeps
  the vertex by itself.
- **`protect.edges` keeps its present meaning**: a listed pair survives as an edge with both ends kept. A caller who
  wants a line held whole lists its edges there, as today; `lines` is for a line that may thin. **[implemented,
  #1326]** — unchanged; a line that no step touches leaves every byte but its row and echo (`MQ173`).

### Stage B — measured [measured, #1326]

The new input on the two cases, beside Stage A's readings, at the consumer's policies with the skinning veto at
1 px and `maxDeviation` 1 px; the floor is the yardstick, not a promise — no minimality is claimed for the chain.
Edge = the displacement against the dense reference (`edgeDisplacement`).

| case: build | line vertices | `MQ_LINE_DEVIATION` | result V | edge vs dense, px |
| --- | --- | --- | --- | --- |
| blink: (b) the line as `protect.edges` | 18 → 18 | — | 27 | 0.000002 |
| blink: (c) its corners in `protect.vertices` | 18 → 4 (3 of 4 chain edges result edges) | — | 13 | 0.000001 |
| blink: **`lines`** | 18 → **4** (the corners, 4 of 4 joined) | 0 | **13** | **0** |
| blink: `lines` + `boundaryRuns` 4 | 18 → 4 | 0.999133 | 13 | 0.570001 |
| blink: floor chain (4) as edges (Stage A) | 4 | — | 16 | 0.950002 |
| face: (b) traced rings as `protect.edges` | 436 → 436 | — | 511 | 0 |
| face: (c) floor vertices in `protect.vertices` | 436 → 62 | — | 134 | 0.964237 |
| face: **`lines`** | 436 → **25 + 26 + 10 = 61** (61 of 61 joined) | 1, 1, 1 | **133** | **1.009629** |
| face: `lines` + `boundaryRuns` 8 | 436 → 23 + 24 + 9 = 56 | 1, 1, 1 | 123 | 1.009629 |
| face: `lines`, veto absent | 436 → 58 | 1, 1, 1 | 100 | 2.333333 |
| face: `lines` at 0.75 px | 436 → 98 | 0.73, 0.73, 0.74 | 173 | 1 |
| face: floor chains (19 + 21 + 7 = 47) as edges (Stage A) | 47 | — | 123 | 1.014074 |
| face: five lines, the eyewhites sharing 32 vertices and 15 segments with the lashes | 602 → 126 | 1 × 5 | 169 | 1.009629 |

The line's own bound does what it says and no more — Stage A's finding stands: the chain sits within 1 px and the
edge reads 1.0096 px, so the motion bound remains the consumer's to derive (HQ ruling on #1326). The eyewhites run
only on a source that carries them: the consumer's exported ring source holds 9 of 86 and 12 of 80 of their traced
vertices, and a line declared over those is refused `REDUCE_INPUT_LINE` (a pair that is no source edge); on a scratch
source whose constraints are the union of all five rings (shared vertices merged by position) they reduce as above.

### The floor, found from outside [measured, #1326]

The fewest vertices of each line within 1 px of it — the exact shortest cycle over every start, each chord valid when
every vertex it skips is within the bound of it (the per-arc two-sided distance, by the subsequence argument above);
Douglas–Peucker at the same bound for comparison. Then the floor chain made a chain of **source edges** (a scratch
constrained Delaunay triangulation over the case's hull and lattice and the kept line vertices, lattice points within
1 px of a chord dropped — scratch only, since rig-c has no such builder), reduced with the chords as `protect.edges`
— the result the proposed mechanism would have at its floor — and the edge displacement read against the dense
reference.

| case | line | vertices | floor at 1 px | Douglas–Peucker at 1 px |
| --- | --- | --- | --- | --- |
| blink | the hole's ring | 18 | 4 | 4 |
| sample face | lash_l (traced) | 154 | 19 | 28 |
| sample face | lash_r (traced) | 194 | 21 | 32 |
| sample face | mouth (traced) | 88 | 7 | 10 |

| case: build | line vertices | result | edge vs dense, px — veto 1 px | veto absent |
| --- | --- | --- | --- | --- |
| blink: floor chain, 4 (one corner moved 1 px along the side) | 4 | 16 / 8 | **0.950002** (source 0.875002) | 0.950002 |
| blink: the four corners, also 4 | 4 | 16 / 8 | 0 | 0 |
| face: (a) lattice 10, no line | — | 91 | 3.463595 | — |
| face: (b′) the traced rings as `protect.edges` | 436 | 511 | 0 | — |
| face: (c′) the floor's 47 vertices in `protect.vertices`, today's API | 62 kept | 134 | 0.964237 (kept chain 1.765045 px off the line) | — |
| face: the floor chains as edges | 47 | 123 / 89 | **1.014074** (the source's own) | **2.644509** |
| face: floors at 0.75 px as edges | 72 | 145 / 114 | 0.889408 | 0.875752 |
| face: floors at 0.5 px as edges | 120 | 196 / 162 | 0.545455 | **1.5** |
| face: Douglas–Peucker at 1 px as edges | 70 | 144 / 112 | 0.745356 | 0.925926 |

**The line's own bound is not sufficient, and the field between the lines needs interior vertices as well.** Two
measured reasons:

1. **At the face's floor the displacement is over the bound before any reduction**: the floor source itself reads
   1.014074 px, at a sample 0.970143 px from its chord, and the veto cannot see it because the veto's reference is
   that source. A geometric deviation δ moves the edge by about δ·|∇w|·|T| — 1 in both fixtures by construction (the
   face's falloff band is |T|, the blink's ramp is the hole's height), above 1 where the lid's share falls faster than
   the lid travels — so a line bound stated in drawing px bounds the edge only through a factor the line does not
   know.
2. **Without the veto the interior collapses and the edge leaves the bound with the line held**: 2.644509 px at the
   floor, and 1.5 px even with the line at 0.5 px (120 vertices). The blink is the exception that shows why — its
   share is constant on both sides of the edge, so nothing between the lines needs holding (0.95 either way); the
   face's share falls off over 15 px around the lashes, and only interior vertices carry that.

So for stage B [proposal]: a line row bounds the line's shape, and **the displacement still has to be held by a row
that reads the field** — today only `targets.skinning` does, and it reads it against the source, so a line declared
without the veto should be refused or reported as not motion-validated, and the source the veto measures against has
to be one whose own edge is within the bound (the floor at 1 px is not, on the face; 0.75 px or Douglas–Peucker at
1 px are). Between equal counts the choice of vertices matters as much as the count: the blink's exact floor and its
four corners are both 4 vertices, at 0.95 and 0 px.

**Crossings.** The eyewhite outlines meet the lash outlines — **14 and 13 junctions** (run ends and point contacts),
with **5 and 10 unit pixel edges shared**, every junction already a traced vertex of both. With each junction pinned
in both lines the floors are eyewhite 19 / 16 and lash 28 / 29 (alone 8 / 7 and 19 / 21): 33 and 32 distinct
vertices per eye against 27 and 28 if the lines were independent. They are **excluded from the displacement
builds**: the lid's share reads only the lash footprints, so an eyewhite line changes no sample's rule, and the scratch
triangulator does not merge overlapping constraints — which is the case the contract's shared-run clause exists for.

### Where the builder belongs [proposal]

**`SourceMesh` input only; the consumer triangulates.** By the ownership line in this page's header: which footprint
is a feature line, which lines meet, and at what spacing a line is sampled are authoring intent — parts's — while a
line's deviation, its survival as edges and its refusals are generic geometry — rigc's, and the contract above is
complete without a builder. By what each side can refuse by name: rigc can refuse an index, a non-edge pair, a
crossing without a shared vertex and a line off the outline, all from the mesh it is handed; only the builder can
refuse a footprint whose outline crosses another's without a meeting point, or a ring that simplifies to nothing,
because only it sees the footprints. A rig-c builder would need what the tree does not have — a constrained Delaunay
triangulation that recovers interior segments (rig-c has `earClip` of one outline), crossing and overlap resolution
into shared vertices, and the interior-point placement parts already owns. And parts's `contourMesh` is, read in
rig-parts `src/contour.ts`, constrained only against the outline: interior points are inserted and flipped Delaunay,
and a polygon region's edges are not constraints (its own survey searched ring spacings until Delaunay happened to
contain every ring edge — 4 px on the blink, 2.5 px on the face). So the builder that is needed is an extension of
parts's — segment recovery against interior polylines — not a new one here.

### What was rejected from the issue and the HQ comment

- *"one-sided … as `MQ_BOUNDARY_DEVIATION` does"* — that row is the symmetric Hausdorff distance, computed exactly,
  not sampled; the contract copies that.
- *"converted by `pageScale` as every other row"* — the geometric rows are in drawing px and are not converted; only
  the raster rows are.
- *"rig-parts has a CDT"* — constrained against the outline only; interior lines are not constraints there.
- rig-parts's build (iv) as "the line thinned": of its 70 anchors (the simplified rings), only the 36 that coincide
  with a source vertex were protected, the reduction kept 62 line vertices, and its kept chain is **2.761074 px** from
  the line — its 1.222456 px edge measures that, not a line thinned under a bound.

## Stage A controls

[proposal] Suite prefix `MQ`, unused in `selftest.ts` today; names follow the
tree's `CODE_SENTENCE` convention, every one with a positive control and every
row of §4 with a planted failure. Fixtures are generated (`fixtures/public.ts`
convention): checkerboard plates, no literal measured numbers. **Every control
listed below exists and passes** since stage C2 (#1230): each name maps to the
code it is printed under and the suite that prints it in the two paragraphs
that follow and in the list, `MQ45` is held by the install smoke rather than
`selftest.ts`, and `MQ26` is the one whose statement is held partly by other
controls (`EH06`, `MB07`), as its entry says.

[implemented, #1224] Built and passing, in the `mesh-quality` suite of
`selftest.ts`: `MQ00` (its geometry half, renamed for what it measures),
`MQ01`–`MQ09`, `MQ16`, `MQ19` (its geometry half: a source that fails its own
coverage bound is reported `fail` and not accepted — the refusal as a
reference is stage C's), `MQ21` (its geometry half: the attachment's and a
region's floor), `MQ23`, `MQ25`, `MQ26` (its call half), `MQ27`, `MQ28` (its mask half — a
duplicate candidate id has no input before stage C), `MQ29`, `MQ30`, `MQ34`
and `MQ44`; and since stage B2, `MQ14`, `MQ17`, `MQ18`, `MQ24`, `MQ32`, `MQ33`,
`MQ40`, `MQ43`, with `MQ23` and `MQ25` extended to `reduceMesh`, plus the two
controls the consumer asked for in its acknowledgement (rig-parts#126,
comment 6042150608) — each composed operation passing with the other idle,
`MQ46` and `MQ47` below. `MQ26` is split: its control holds that no module
under `src/` but the three that define the operations names them, so an
unchanged spec cannot reach them; the bytes themselves are held by `EH06` and
`MB07`, on every run against `tools/emit_hashes.base.json`, and are not
re-checked by a second gate over the same base.

[implemented, #1230] Built and passing, in the `mesh-compare` suite of
`selftest.ts`: `MQ55` (`MQ00`'s motion half — the `MQ` prefix is opened at 00 by
the `mesh-quality` suite and continued here, `TY18`), `MQ10`, `MQ15`, `MQ20`, `MQ22`, `MQ35`,
`MQ36`, `MQ37`, `MQ39`, `MQ41` and `MQ42` — the controls rig-parts#126
(comment 6045645512) asked C1 to carry for UV carrier mapping, schedule
identity and held-out separation, and report states. `MQ26` names the fourth
defining module. Since stage C2, in the same suite, the rest of the
contract's motion controls — under new codes, because their numbers are
`mesh-quality`'s or already printed here and a code names one control
(`TY17`):

| contract | printed as | suite |
| --- | --- | --- |
| `MQ11` | `MQ56_TWO_CANDIDATES_THAT_DROP_THE_SAME_ART_AGREE_AND_BOTH_FAIL_COVERAGE` | `mesh-compare` |
| `MQ12` | `MQ57_A_SINGLE_BONE_RIGID_MOTION_NEEDS_NO_INTERIOR_VERTEX_TO_MEASURE_ZERO` | `mesh-compare` |
| `MQ13` | `MQ58_A_MULTI_BONE_BEND_WITHOUT_INTERIOR_VERTICES_FAILS_LOCAL_DEFORMATION_AT_THE_BEND_FRAME` | `mesh-compare` |
| `MQ19`, motion half | `MQ59_A_REFERENCE_THAT_FAILS_ITS_OWN_COVERAGE_IS_REFUSED_AS_A_REFERENCE` | `mesh-compare` |
| `MQ21`, motion half | `MQ60_A_DOMAIN_UNDER_ITS_SAMPLE_FLOOR_IS_NOT_MEASURABLE_WITH_ITS_COUNT_AND_HULL_SAMPLES_DO_NOT_RAISE_IT` | `mesh-compare` |
| `MQ28`, motion half | `MQ61_A_DUPLICATE_CANDIDATE_ID_IS_REFUSED_NAMING_BOTH` | `mesh-compare` |
| `MQ31` | `MQ62_LOCAL_DEFORMATION_STATES_ITS_SAMPLE_DOMAIN_AND_COUNT_AND_A_SAMPLE_REMOVED_LOWERS_THE_COUNT` | `mesh-compare` |
| `MQ38` | `MQ63_CONTROL_CANDIDATES_DIFFERING_ONLY_IN_ALLOWLISTED_INPUTS_ARE_COMPARED_AND_A_PERMITTED_FOLD_IS_LISTED_NOT_ZEROED` | `mesh-compare` |
| `MQ45` | `SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`, a step of every case | the install smoke (`bun run smoke`) |

Beyond the contract's list, #1236 added
`MQ64_A_COMPARISON_OVER_A_CONTOUR_GENERATED_BUILD_IS_ACCEPTED_AND_THE_SIGN_FLIPPED_ON_READ_FAILS_ORIENTATION_NAMING_THE_TRIANGLE`
(`mesh-compare`) — *Stage C2*, the closed paragraph.

[measured, #1266] §7's public reproducer, in the same suite and under the
next free codes:
`MQ79_A_REDUCTION_HOLDING_EVERY_STATIC_BOUND_FAILS_MOTION_ON_A_WEIGHT_RAMP_AND_A_LESS_REDUCED_CANDIDATE_OF_THE_SAME_SOURCE_PASSES`
and
`MQ80_RIGID_NO_REDUCTION_BUDGET_AND_A_BOUND_NO_PREFIX_MEETS_ARE_FOUR_DISTINCT_OUTCOMES_AND_THE_LAST_IS_THE_ORDERS_NOT_THE_MESHS`
(`mesh-compare`). They hold today's behaviour on that fixture — the gap and its
feasible controls — and implement nothing of §7's proposal.

[implemented, #1268] §7's mechanism 2, in the `mesh-quality` suite, under the
next free codes:
`MQ81_CONTROL_STOP_AFTER_ACCEPTED_K_RETURNS_THE_MESH_OF_THE_KTH_ACCEPTED_STEP_ON_THE_REPRODUCERS_STRICT_RUN`,
`MQ82_CONTROL_A_REPLAY_TERMINATES_REPLAYED_TO_ACCEPTED_STEP_ZERO_TAKES_NO_STEP_AND_A_STOP_BEYOND_THE_RUN_KEEPS_ITS_OWN_TERMINATION_NAMING_IT`,
`MQ83_A_REPLAY_PLANTED_TO_STOP_ONE_ACCEPTED_STEP_EARLY_OR_LATE_IS_CAUGHT_NAMING_THE_STEP`
(the plant is `ReplayPlant`, passed through `reduceMeshWith`; `reduceMesh`
plants none) and
`MQ84_A_STOP_AFTER_ACCEPTED_THAT_IS_NOT_A_WHOLE_NUMBER_0_OR_MORE_IS_REFUSED_NAMING_THE_FIELD`.

[measured, #1271] §8's public reproducer, in the `mesh-compare` suite, under
the next free codes — one fact each, every one read beside a run or a plant
that makes its predicate fire (named in its line):
`MQ85_THE_STRICT_REDUCTION_OF_A_TRACED_BOUNDARY_REMOVES_EVERY_INTERIOR_VERTEX_AND_AT_MOST_A_TENTH_OF_THE_BOUNDARY`
(plant: the run at deviation bound 2),
`MQ86_THE_STRICT_REDUCTION_OF_A_TRACED_BOUNDARY_STOPS_ON_MQ_BOUNDARY_DEVIATION`
(plant: the bound out of reach, which stops on `MQ_OVERSHOOT`),
`MQ87_THE_STRICT_REDUCTION_OF_A_TRACED_BOUNDARY_HOLDS_EVERY_STATIC_BOUND_AND_FAILS_MOTION`
(its predicate's passing side is read by `MQ89`),
`MQ88_A_REPLAY_BISECTED_ON_GRID_FRAMES_PASSES_ON_ITS_HELD_OUT_IRR_FRAMES_AND_THE_NEXT_STEP_FAILS`
(the step after the chosen one),
`MQ89_A_HAND_BUILT_MESH_OVER_THE_SAME_BOUNDARY_WITH_FEWER_VERTICES_THAN_THE_REPLAY_PASSES_EVERY_STATIC_ROW_AND_MOTION`
(plants: the source as the mesh with "fewer" vertices; one hull vertex pushed
the bound plus a pixel out, failing `MQ_BOUNDARY_DEVIATION`) and
`MQ90_WITH_THE_DEVIATION_BOUND_AT_TWICE_THE_SOURCE_TOLERANCE_THE_BOUNDARY_REDUCES_AND_EVERY_ART_ROW_STILL_PASSES`
(plant: the strict run). They hold today's behaviour on that fixture and
implement nothing of §8; `MQ79` and `MQ80` are unchanged.

[implemented, #1279] §8's Stage B first landing, on the same fixture in the
`mesh-compare` suite, under the next free codes — each read beside a plant
that must make it fire (`ReductionPlant`, passed through `reduceMeshWith`;
`reduceMesh` plants none):
`MQ91_CONTROL_ACCEPTED_AT_IS_ONE_ENTRY_PER_ACCEPTED_OPERATION_AND_STOP_AFTER_ACCEPTED_REPLAYS_TO_IT_ACROSS_A_BOUNDARY_RUN`
(plant: a run recorded as one removal per vertex),
`MQ92_ON_THE_TRACED_BOUNDARY_A_BOUNDARY_RUN_TAKES_THE_RESULT_PAST_WHAT_SINGLE_REMOVALS_REACH_WITH_EVERY_STATIC_ROW_HELD`
(plants: the singles-only run; runs taken without their rows),
`MQ93_A_CALL_WITHOUT_BOUNDARY_RUNS_TRIES_NONE_AND_WRITES_ONE_SINGLE_VERTEX_ENTRY_PER_STEP`
(plant: runs tried without the opt-in — the bytes against 2.24.0 are measured
out of suite, §8, because the tree keeps no older copy to compare with),
`MQ94_A_BOUNDARY_RUN_THAT_WOULD_BREACH_THE_DEVIATION_BOUND_IS_REFUSED_NAMING_THE_ROW`
(plant: runs taken without their rows),
`MQ95_A_BOUNDARY_RUNS_THAT_IS_NOT_A_MAX_VERTICES_OF_2_OR_MORE_IS_REFUSED_NAMING_THE_FIELD`
and
`MQ96_CONTROL_THE_DEVIATION_FLOOR_REFUSES_WITHOUT_MEASURING_AND_CHANGES_NO_BYTE_OF_ANY_RESULT`
(plant: the floor read half a pixel short of the bound). `MQ81`–`MQ84` read
`acceptedAt`'s entries by their `step`, and `MQ67` counts a removal the floor
decides beside the measurements, which it would otherwise read as a step
measured without the rasters.

[implemented, #1280] §8's allocation rows, in the `mesh-quality` suite, from
`MQ120` (clear of codes another change was opening from `MQ91` in
`mesh-compare` at the time):
`MQ120_THE_ALLOCATION_ROWS_SEPARATE_SECTION_8S_FIXTURES_AT_THE_FIGURES_IT_PRINTS_AND_EVERY_ROW_IS_UNDECLARED`,
`MQ121_GRADE_MIN_ANGLE_P10_AND_DEFORM_LOAD_EQUAL_THE_SUITES_OWN_DERIVATION_ON_EVERY_FIXTURE`,
`MQ122_CONTRAST_AND_LOAD_ARE_NOT_MEASURABLE_WITHOUT_A_DECLARED_AMPLITUDE_OR_WEIGHTS_OR_FOR_AN_UNDECLARED_PAIR_NAMING_THE_FIELD`,
`MQ123_NO_ALLOCATION_ROW_IS_REQUIRED_SO_NONE_BLOCKS_A_STEP_PASSES_OR_MOVES_A_VERDICT`,
`MQ124_EVERY_REPORT_WITHOUT_ITS_FIVE_ALLOCATION_ROWS_IS_THE_REPORT_WITHOUT_THEM_BYTE_FOR_BYTE`,
`MQ125_AN_OUTLINE_OF_B_STAR_REFERENCE_HULL_VERTICES_HOLDS_COVERAGE_UNDERCUT_AND_DEVIATION_AND_THE_SEARCH_STAYS_UNDER_ITS_BOUND`,
`MQ126_THE_ALLOCATION_ROWS_AND_THE_AMPLITUDE_ECHO_ARE_BYTE_IDENTICAL_FOR_ONE_INPUT_IN_ANY_KEY_ORDER`
and
`MQ127_A_MOTION_AMPLITUDE_THAT_IS_NOT_A_MOTION_AMPLITUDE_IS_REFUSED_NAMING_THE_FIELD`
— each plant named in §8's paragraph on them. `MQ00` reads the allocation
rows aside: on its unweighted mesh with no amplitude, two of them are
`not-measurable` by design, and `MQ122` holds those states.

[implemented, #1283] §8's Stage B second landing, on `MQ79`'s ramp and the
same fixture in the `mesh-compare` suite, under the next free codes — each
read beside a plant that must make it fire (`RetriangulationPlant` and
`OrderPlant`, members of `ReductionPlant`):
`MQ97_THE_POST_PASS_RE_TRIANGULATES_THE_RAMPS_STRICT_RESULT_ON_ITS_OWN_VERTICES_AND_IT_PASSES_THE_MOTION_ROW_THE_REMOVALS_TRIANGLES_FAIL`
(plant: the call without the field),
`MQ98_ON_THE_TRACED_BOUNDARY_THE_POST_PASS_KEEPS_EVERY_VERTEX_AND_ITS_BISECTED_REPLAY_KEEPS_FEWER_THAN_THE_REMOVALS_AND_PASSES_HELD_OUT`
(plant: `MQ88`'s bisection over the removals' triangles),
`MQ99_CONTROL_UNDER_THE_POST_PASS_STOP_AFTER_ACCEPTED_IS_THE_BUDGET_CUT_BYTE_FOR_BYTE_AND_THE_REMOVALS_VERTEX_SET`
(plants: the pass skipped on a replay; the loop reordered under the opt-in),
`MQ100_A_CALL_WITHOUT_RETRIANGULATE_OR_REMOVAL_ORDER_WRITES_NO_NEW_KEY_AND_ATTEMPTS_ITS_SINGLES_IN_SOURCE_ORDER`
(plants: the pass, and the order, without the opt-in — the bytes against
`b2503e4` are measured out of suite, §8, as for `MQ93`),
`MQ101_A_POST_PASS_WHOSE_FLIPS_WOULD_BREACH_A_DECLARED_ROW_IS_NOT_TAKEN_AND_NAMES_THE_ROW`
(plants: the flip criterion inverted, measured and unmeasured),
`MQ102_THE_POST_PASS_NEITHER_FLIPS_NOR_MAKES_AN_EDGE_A_REGION_HOLDS_SO_EVERY_REGION_ROW_READS_AS_THE_REMOVALS_LEFT_IT`
(plant: flips that ignore the region),
`MQ103_THE_DEFORMATION_LOAD_ORDER_ATTEMPTS_EACH_PASSS_SINGLES_IN_ASCENDING_PREDICTED_LOAD_AND_ITS_REPLAY_KEEPS_FEWER_VERTICES`
(plant: the loads ranked descending),
`MQ104_A_RETRIANGULATE_OR_REMOVAL_ORDER_THAT_IS_NOT_ITS_ONE_VALUE_IS_REFUSED_NAMING_THE_FIELD`
and
`MQ105_THE_REPORT_ECHOES_EACH_FIELD_ONLY_WHEN_SET_AND_SAYS_WHICH_TRIANGULATION_THE_MESH_CARRIES_AND_WHAT_IS_NOT_PROMISED`
(plant: the pass without the opt-in). The observer `MQ94` and `MQ96` read
(`AttemptRecord`) carries two more fields for `MQ100` and `MQ103`: the pass
an attempt was made in, and the load a single removal was ranked by under the
load order (null otherwise).

[implemented, #1287] §8's amplitude on a reduction, on `MQ79`'s ramp and the
same fixture in the `mesh-compare` suite, under the next free codes — each
read beside a plant that must make it fire (`AmplitudePlant`, a member of
`ReductionPlant`):
`MQ106_WITH_MOTION_AMPLITUDE_THE_REDUCTIONS_REPORT_MEASURES_THE_DEFORM_LOAD_AS_THE_RETURNED_MESH_MEASURES_AND_IT_SCALES_WITH_THETA`
(plant: the amplitude not carried to the result's measurement),
`MQ107_WITHOUT_MOTION_AMPLITUDE_OR_WITH_IT_NULL_THE_TWO_ROWS_ARE_NOT_MEASURABLE_NAMING_WHICH`
(plants: an amplitude invented for a field left out; `null` passed on as
left out),
`MQ108_A_MOTION_AMPLITUDE_THAT_IS_NOT_ONE_IS_REFUSED_BY_THE_REDUCTION_BEFORE_ANY_WORK_NAMING_ITS_PATH_IN_THE_MEASUREMENTS_WORDS`
(plant: the field left to the result's measurement to validate),
`MQ109_THE_FIELD_MOVES_NO_STEP_NO_MESH_AND_NO_BYTE_BEYOND_THE_TWO_ROWS_AND_ITS_ECHO_AND_EVERY_MEASUREMENT_CARRYING_IT_WRITES_THE_SAME`
(plant: a measured row read as blocking a step — the bytes against
`5be70d8` are measured out of suite, §8, as for `MQ93` and `MQ100`) and
`MQ110_THE_REDUCTION_ECHOES_MOTION_AMPLITUDE_ONCE_EXACTLY_WHEN_SET_NULL_INCLUDED_AND_ALSO_WHEN_NO_MESH_IS_RETURNED`
(plant: `null` echoed for a field left out). `MQ109` also holds the path the
decision in §8 was measured against — the amplitude carried into every
measurement of the call, a `ReductionPlant` that is not a fault — to the same
bytes as the result's alone.

[measured, #1302] §10's decomposition, on the same fixture in the `mesh-compare`
suite, as one unit (`MQ144-MQ147`) after the codes #1294–#1300 took — each read
beside a run or a plant that must make it fire, named in its line:
`MQ144_UNDER_THE_TRIAL_POLICY_THE_REPLAY_KEEPS_ITS_BOUNDARY_AT_B_STAR_AND_ONLY_INTERIOR_THE_MOTION_CUT_LEAVES_AND_THE_BUCKETS_SUM_TO_ITS_VERTICES`
(the four buckets and the rewind loss of the trial policy's bisected replay;
plants: the motion bucket read against the source, and `MQ88`'s strict replay,
whose boundary is above B\*),
`MQ145_A_MESH_OVER_A_RELOCATED_OUTLINE_WITH_THE_INTERIOR_ONLY_AT_THE_JOINTS_PASSES_EVERY_STATIC_ROW_AND_MOTION_WITH_FEWER_VERTICES_AND_BINDINGS_THAN_THE_TRIAL_REPLAY`
(the floor, built by `abRelocatedOutline`; plants: the same outline with no
interior, refused in motion, and an outline vertex pushed 2 px out, refused by
`MQ_BOUNDARY_DEVIATION`),
`MQ146_THE_SOURCE_STARTS_AT_MORE_THAN_THREE_TIMES_THE_FLOOR_AND_ITS_INTERIOR_ALONE_EXCEEDS_IT`
(plant: the trial replay read as the floor) and
`MQ147_A_DECLARED_INFLUENCE_LIMIT_PRUNES_NO_KEPT_VERTEX_OF_A_REMOVAL_ONLY_REDUCTION_SO_THE_RESULTS_BINDINGS_ARE_THE_SOURCES`
(plant: the same limit applied to the source before the call). The trial
policy's runs go through the suite's memo; the unit measured 49 s alone on
darwin (Apple M4, load 6–14), most of it the bisection's seven replays and
comparisons and the outline search.

[implemented, #1315] §10's over-bound report, on the same fixture's trial-policy full run (`MQ144`'s, refused in
motion) and `MQ79`'s ramp in the `mesh-compare` suite, each control a unit of its own (`MQ152` to `MQ155`, after
`MQ150`–`MQ151`) and each read beside a plant that must make it fire (`OverBoundPlant`, a member of `ComparePlant`):
`MQ152_THE_PER_TRIANGLE_MAXIMUM_AGREES_WITH_THE_ROWS_WORST_OVER_THE_SELECTION_AND_WITH_THE_WORST_SAMPLES_CARRYING_TRIANGLE`
(the `irr` frames selected and `grid` held out, so the table and the listing read different frames; plants: a listed
sample's triangle taken from the reference's carrier, and the table read over every frame),
`MQ153_A_CAP_BELOW_THE_OVER_BOUND_COUNT_LISTS_THE_WORST_SAMPLES_FIRST_AND_STATES_THE_COUNT_OF_ALL_OF_THEM`
(a cap of a quarter of the over-bound count; plants: the samples listed in domain order, and the total counted off the
listed samples),
`MQ154_WITHOUT_OVER_BOUND_A_POSED_COMPARISON_WRITES_THE_SAME_TEXT_AND_WITH_IT_ONLY_THE_BLOCK_AND_THE_ECHO_ARE_ADDED`
(on both subjects; plant: the field echoed when left out — the bytes against the tree before it are measured out of
suite, §10 *Implemented — the over-bound report*) and
`MQ155_A_MALFORMED_OVER_BOUND_REQUEST_IS_REFUSED_NAMING_THE_FIELD_BEFORE_ANY_BUILD_IS_READ`
(`null`, a number, `maxSamples` 0, 2.5 or left out, `triangles` `'some'` or left out, each beside an unreadable model;
plant: the field not validated). The card's control (a) — the listed triangles' vertices a subset of the rewind's — is
not among them: §10 measured it empty by construction, and records what the set is instead.

Every other name in the list is printed under its own code, by the suite the
paragraphs above name.

- `MQ00_CONTROL_A_MESH_COMPARED_WITH_ITSELF_MEASURES_ZERO_ON_EVERY_ROW_AND_EVERY_FRAME` —
  its geometry half is `MQ00` (`MQ00_CONTROL_A_MESH_MEASURED_AGAINST_ITS_OWN_HULL_DEVIATES_ZERO_AND_ITS_RASTER_ROWS_ARE_THE_LEGACY_FIT`,
  `mesh-quality`) and its motion half is `MQ55`
  (`MQ55_CONTROL_A_MESH_COMPARED_WITH_ITSELF_MEASURES_ZERO_ON_EVERY_ROW_AND_EVERY_FRAME`, `mesh-compare`)
- `MQ01_A_HULL_VERTEX_MOVED_INWARD_FAILS_COVERAGE_AND_UNDERCUT_NAMING_THE_WORST_PIXEL`
- `MQ02_A_HULL_VERTEX_PUSHED_OUT_K_PIXELS_MEASURES_OVERSHOOT_K_WITHIN_ONE_SPATIAL_QUANTUM`
- `MQ03_A_SPANNED_HOLE_IS_NOT_OVERSHOOT_AND_IS_COUNTED_AS_HOLE_PIXELS`
- `MQ04_A_DIAGONAL_PINCH_EXPOSES_BOTH_LABELLED_FILLS_AND_THE_LEGACY_FIT_IS_UNCHANGED` (P12)
- `MQ05_ONE_TRIANGLE_FLIPPED_FAILS_ORIENTATION_NAMING_THE_TRIANGLE`
- `MQ06_A_NEAR_COLLINEAR_TRIANGLE_INSIDE_THE_WINDING_BAND_IS_DEGENERATE_AND_ONE_JUST_OUTSIDE_IS_NOT`
- `MQ07_AN_EDGE_CROSSING_A_REGION_WITH_BOTH_ENDPOINTS_OUTSIDE_IS_HELD_TO_THE_REGION_BOUND_NAMING_EDGE_VALUE_AND_BOUND` (P15)
- `MQ08_AN_EDGE_IN_THE_TRANSITION_BAND_IS_HELD_TO_THE_SMALLEST_GRADED_BOUND_ON_ITS_INTERSECTION_AND_ONE_OUTSIDE_IS_FREE` (P16)
- `MQ09_A_MEASUREMENT_WITH_NO_DECLARED_BOUND_IS_UNDECLARED_AND_SATISFIES_NO_REQUIRED_CLAIM` (P6)
- `MQ10_NO_MOTION_SUPPLIED_LEAVES_MOTION_NULL_AND_MOTION_REQUIRED_IS_NOT_ACCEPTED` (P6)
- `MQ11_TWO_CANDIDATES_THAT_DROP_THE_SAME_ART_AGREE_AND_BOTH_FAIL_COVERAGE` — printed as `MQ56` (`mesh-compare`)
- `MQ12_A_SINGLE_BONE_RIGID_MOTION_NEEDS_NO_INTERIOR_VERTEX_TO_MEASURE_ZERO` — printed as `MQ57` (`mesh-compare`)
- `MQ13_A_MULTI_BONE_BEND_WITHOUT_INTERIOR_VERTICES_FAILS_LOCAL_DEFORMATION_AT_THE_BEND_FRAME` — printed as `MQ58` (`mesh-compare`)
- `MQ14_A_LOCALISED_REGION_REFINES_INSIDE_AND_INSERTS_NO_VERTEX_OUTSIDE_ITS_REGION_AND_BAND` (P16)
- `MQ15_A_VERDICT_THAT_DIFFERS_BETWEEN_PHASES_SAYS_SO_NAMING_BOTH_FRAME_IDS` (P7)
- `MQ16_A_VALUE_WITHIN_ONE_VALUE_INCREMENT_OF_ITS_BOUND_IS_FLAGGED_AND_ITS_VERDICT_UNCHANGED` (correction 2)
- `MQ17_A_REMOVAL_REMAPS_A_VERTICES_RUN_A_REORDER_ONLY_CHANGE_REMAPS_TOO_AND_AN_INSERTION_UNDER_ONE_IS_REFUSED_BY_NAME` (P18)
- `MQ18_A_WEIGHT_JUMP_EDGE_SURVIVES_VERTEX_REMOVAL_AND_RETRIANGULATION` (correction 3)
- `MQ19_A_REFERENCE_THAT_FAILS_ITS_OWN_COVERAGE_IS_REFUSED_AS_A_REFERENCE` — geometry half `MQ19` (`mesh-quality`), motion half printed as `MQ59` (`mesh-compare`)
- `MQ20_SKELETONS_THAT_DIFFER_IN_ONE_BONE_FIELD_ARE_REFUSED_NAMING_IT` (now one case of `COMPARE_INPUTS_DIFFER`, correction 5)
- `MQ21_A_DOMAIN_UNDER_ITS_SAMPLE_FLOOR_IS_NOT_MEASURABLE_WITH_ITS_COUNT_AND_HULL_SAMPLES_DO_NOT_RAISE_IT` (P9) — geometry half `MQ21` (`mesh-quality`), motion half printed as `MQ60` (`mesh-compare`)
- `MQ22_PHYSICS_RESET_IS_THE_SAME_FOR_EVERY_CANDIDATE_AND_A_CHANGED_DT_MOVES_THE_ROWS` (P10)
- `MQ23_EACH_REFUSAL_CODE_IS_REACHED_BY_ONE_INPUT_AND_NAMES_OBJECT_VALUE_AND_REQUIREMENT`
- `MQ24_EACH_TERMINATION_REASON_IS_REACHED_BY_ONE_INPUT`
- `MQ25_TWO_RUNS_ON_ONE_INPUT_WRITE_BYTE_IDENTICAL_REPORTS`
- `MQ26_AN_UNCHANGED_SPEC_EMITS_THE_BYTES_IT_EMITTED_BEFORE` (the emit-hash
  base, read for the reduction's absence) — [implemented, #1224] as
  `MQ26_NO_MODULE_UNDER_SRC_BUT_THE_FOUR_THAT_DEFINE_THE_OPERATIONS_NAMES_THEM_SO_AN_UNCHANGED_SPEC_CANNOT_REACH_THEM`
  (the three of #1224, and `src/meshcompare.ts` since #1230)
  for the reduction's absence, and `EH06` and `MB07` for the bytes

The five corrections, one positive control and one planted failure each:

- Correction 1 (typed fields), positive:
  `MQ27_CONTROL_TWO_ATTACHMENTS_WITH_THEIR_OWN_MASKS_THRESHOLDS_AND_SAMPLE_FLOORS_ARE_EACH_MEASURED_AND_ECHOED_FIELD_FOR_FIELD`
- Correction 1, planted:
  `MQ28_ONE_MASK_GIVEN_FOR_TWO_ATTACHMENTS_OF_DIFFERENT_SIZE_OR_A_DUPLICATE_CANDIDATE_ID_IS_REFUSED_NAMING_BOTH`
  — mask half `MQ28` (`mesh-quality`), duplicate-id half printed as `MQ61` (`mesh-compare`)
- Correction 2 (raster unit), positive:
  `MQ29_CONTROL_PX_FRACTION_AND_COUNT_ROWS_STATE_THEIR_SPATIAL_QUANTUM_AND_THEIR_OWN_VALUE_INCREMENT_AND_A_VALUE_AT_ITS_BOUND_PASSES_AT_BOUND`
- Correction 2, planted:
  `MQ30_A_COVERAGE_WITHIN_ONE_SPATIAL_QUANTUM_BUT_BEYOND_ONE_SAMPLE_INCREMENT_OF_ITS_BOUND_IS_NOT_FLAGGED`
- Correction 2, sampled rows:
  `MQ31_LOCAL_DEFORMATION_STATES_ITS_SAMPLE_DOMAIN_AND_COUNT_AND_A_SAMPLE_REMOVED_LOWERS_THE_COUNT`
  — printed as `MQ62` (`mesh-compare`)
- Correction 3 (admissibility vs density), positive:
  `MQ32_CONTROL_A_COARSE_SOURCE_THAT_MEETS_ITS_ART_BOUNDS_BUT_NOT_THE_REGION_DENSITY_IS_REFINED_NOT_REFUSED`
- Correction 3, planted:
  `MQ33_A_BUDGET_THAT_EXPIRES_BEFORE_ANY_CANDIDATE_MEETS_THE_TARGETS_RETURNS_NO_MESH_NO_GEOMETRY_AND_NOT_ACCEPTED`
- Correction 3, counts:
  `MQ34_A_SOURCE_THAT_IS_NOT_ONE_LOOP_REPORTS_SOURCE_COUNTS_NULL_WITH_A_REASON_NOT_ZEROS`
- Correction 4 (comparison map), positive:
  `MQ35_CONTROL_A_SAMPLE_ON_A_SHARED_UV_EDGE_IS_ONE_HIT_CARRIED_TO_ONE_WORLD_POINT`
- Correction 4, planted:
  `MQ36_OVERLAPPING_UV_TRIANGLES_GIVING_A_SAMPLE_TWO_CARRIERS_ARE_REFUSED_NAMING_THE_SAMPLE_AND_BOTH_TRIANGLES`
- Correction 4, units:
  `MQ37_A_NONUNIFORMLY_SCALED_SETUP_REPORTS_TWO_DECLARED_SINGULAR_SCALES_AND_NO_SINGLE_RATIO`
- Correction 5 (non-mesh equality), positive:
  `MQ38_CONTROL_CANDIDATES_DIFFERING_ONLY_IN_ALLOWLISTED_INPUTS_ARE_COMPARED_AND_A_PERMITTED_FOLD_IS_LISTED_NOT_ZEROED`
  — printed as `MQ63` (`mesh-compare`)
- Correction 5, planted:
  `MQ39_A_CHANGED_PHYSICS_SETTING_WITH_IDENTICAL_BONES_IS_REFUSED_NAMING_THE_INPUT_AND_BOTH_VALUES`

The two composed operations of stage B2, each with the other idle
([implemented, #1224]; asked for in rig-parts#126, comment 6042150608):

- Reduction, positive and planted:
  `MQ46_CONTROL_REDUCTION_ALONE_REMOVES_VERTICES_HOLDING_EVERY_BOUND_AND_A_BOUND_THAT_BLOCKS_EVERY_STEP_IS_NAMED`
- Refinement, positive and planted:
  `MQ47_CONTROL_REFINEMENT_ALONE_INSERTS_ONLY_INSIDE_THE_REGION_AND_ITS_BAND_UNTIL_L_OF_R_HOLDS_AND_A_BOUND_UNDER_ONE_TEXEL_IS_REFUSED`

The exemption agreed on rig-parts#126 (comment 6045645512) and built in
[#1229](https://github.com/rig-c/core/issues/1229), [implemented]:

- `MQ48_THE_COARSE_QUAD_THAT_2_19_0_STOPPED_ON_CONVERGES_AND_IS_ACCEPTED`
- `MQ49_AN_EDGE_TOUCHING_THE_BAND_OUTER_BOUNDARY_AT_ONE_POINT_FROM_OUTSIDE_IS_EXEMPT_IN_THE_MEASUREMENT_AND_LEFT_ALONE_BY_THE_REFINEMENT`
- `MQ50_AN_EDGE_ALONG_THE_BAND_OUTER_BOUNDARY_IS_HELD_AND_AN_EXEMPTION_WIDENED_TO_ANY_BOUNDARY_CONTACT_IS_CAUGHT` (the plant)
- `MQ51_AN_EDGE_CROSSING_A_BAND_OR_A_REGION_WITH_BOTH_ENDPOINTS_OUTSIDE_IS_HELD_AND_AN_END_ON_THE_OUTER_BOUNDARY_EXEMPTS_NO_CROSSING`
- `MQ52_OVERLAPPING_BANDS_ARE_READ_INDEPENDENTLY_AN_EDGE_EXEMPT_FROM_ONE_REGION_IS_STILL_HELD_BY_THE_OTHER`
- `MQ53_WITH_TRANSITION_ZERO_A_BOUNDARY_CONTACT_IS_HELD_AND_AN_INFEASIBLE_REFINEMENT_IS_NAMED_NOT_LOOPED`
- `MQ54_A_REFINEMENT_LIMITED_BY_ITS_BUDGET_OR_A_MINIMUM_ANGLE_IS_NOT_ACCEPTED_AND_NAMES_WHICH`

No degenerate triangle written by the refinement
([#1311](https://github.com/rig-c/core/issues/1311), [implemented]) — an
8 × 8 lattice under a square whose band passes 1/64 px beyond a lattice row,
the same shifted 1/256 px and turned 2°, and the coarse 12 px lattice under a
4 px square:

- `MQ156_CONTROL_THE_REFINEMENT_AS_IT_WAS_WRITES_DEGENERATE_TRIANGLES_ON_A_SQUARE_WHOSE_BAND_PASSES_A_HAIR_BEYOND_A_LATTICE_ROW_SHIFTED_OR_TURNED`
  (the plant `refinement-writes-degenerate`, the rule before the check: 4, 4,
  2 and 26 degenerate triangles)
- `MQ157_THE_REFINEMENT_WRITES_NO_TRIANGLE_MQ_DEGENERATE_REFUSES_AND_ITS_STOP_NAMES_THE_INSERTION_THE_TRIANGLE_AND_THE_BAND`
  (the named corners re-read by the test's own area, the refused insertion
  found in the plant's mesh inside a triangle under the named band; the plant
  fails the same reading on all four)
- `MQ158_WHERE_NO_INSERTION_WRITES_A_DEGENERATE_TRIANGLE_THE_REFINEMENT_IS_THE_ONE_BEFORE_THE_CHECK_BYTE_FOR_BYTE`
  (the band 1/16 px beyond the row, the square turned 5°, a regular 16-gon:
  refined, reduced and accepted, identical to the plant; the plant
  `degenerate-band-widened` changes all three)

A sample within the slack of a shared edge, a sliver beside it
([#1323](https://github.com/rig-c/core/issues/1323), [implemented]) — the
`mesh-compare` suite's strip with a column one pixel wide beside one 16.5 px
wide, the shared edge on a pixel-centre column, nudged in UV only by half the
slack the wide triangle allows (unit `MQ159-MQ161`, plants `CarrierPlant` in
`ComparePlant`):

- `MQ159_CONTROL_THE_RULE_BEFORE_1323_REFUSES_A_SAMPLE_WITHIN_THE_SLACK_OF_A_SHARED_EDGE_WITH_A_SLIVER_BESIDE_IT_AS_AN_OVERLAP`
  (the plant `slack-support-unread`: `COMPARE_UV_CARRIER_NOT_UNIQUE` naming
  the two triangles the test's own barycentric reading finds at all 16 column
  samples; the same input unplanted is not refused)
- `MQ160_A_SAMPLE_WITHIN_THE_SLACK_OF_A_SHARED_EDGE_IS_ONE_HIT_THOUGH_A_SLIVER_BESIDE_IT_READS_A_COORDINATE_ABOVE_CONTAINS`
  (16 of 16 carried, the comparison takes the candidate; the plant
  `narrowest-slack`, the slack read as the sliver's height, refuses it)
- `MQ161_A_SAMPLE_TWO_TRIANGLES_BOTH_HOLD_WELL_INSIDE_IS_STILL_REFUSED_AS_AN_OVERLAP`
  (MQ36's fold, its refused sample reading two or more distinct supports at
  1e-6 uv across its containing triangles by the test's own reading; the plant
  `any-shared-vertex` takes it)

An interior feature line under the current API
([#1326](https://github.com/rig-c/core/issues/1326), stage A, nothing implemented) — `fixtures/blink.ts`'s
synthetic blink, the readings §11 tabulates:

- `MQ162_THE_BLINK_FIXTURE_IS_THREE_VALID_SOURCES_A_LINE_OF_SOURCE_EDGES_AND_A_DENSE_REFERENCE_THAT_READS_THE_LATTICE_ERROR_DERIVED_BY_HAND`
  (the positive control: each source passes its own art rows and binds the lid by the rule, the line's pairs are
  source edges, the lattices read a(s − a)/s; planted, the line's shares borrowed from the 8 px lattice must read
  over the bound)
- `MQ163_A_LATTICE_SOURCE_CANNOT_PLACE_THE_LID_EDGE_AND_ITS_REDUCTION_IS_ACCEPTED_WITH_THE_EDGE_WHERE_THE_LATTICE_PUT_IT`
  (reading (a); vertices must have been removed, so the reading is the reduction's)
- `MQ164_A_LINE_PROTECTED_AS_EDGES_KEEPS_EVERY_VERTEX_IT_HAS_THOUGH_ITS_OWN_SIMPLIFICATION_AT_THE_BOUND_NEEDS_FEWER`
  (reading (b); unprotected, line vertices must be removed, so the survival is the protection's)
- `MQ165_A_LINE_THINNED_THROUGH_PROTECT_VERTICES_IS_BOUNDED_BY_NOTHING_BUT_THE_SKINNING_VETO`
  (reading (c); one corner left out, within the bound with the veto and over it, accepted, without)

Named lines ([#1326](https://github.com/rig-c/core/issues/1326), stage B, [implemented]) — the blink's lined source
and lines over its 8 px lattice found by walking the grid; plants `LinePlant` in `ReductionPlant`:

- `MQ166_A_MALFORMED_LINE_IS_REFUSED_REDUCE_INPUT_LINE_NAMING_THE_LINE_THE_INDEX_OR_PAIR_AND_THE_RULE_BEFORE_ANY_WORK`
  (20 rules, each red on its own malformed input with the rasters never read; the measurement's same words and its
  own two; a valid ring, a shared run and a measurement refused by nothing)
- `MQ167_A_LINE_THINS_UNDER_ITS_OWN_BOUND_TO_THE_HOLES_FOUR_CORNERS_JOINED_BY_RESULT_EDGES_AND_MQ_LINE_DEVIATION_READS_ITS_CHAIN`
  (the row against the test's own two-sided reading, closed and open; plant `line-rows-unread`)
- `MQ168_A_STEP_THAT_WOULD_LEAVE_TWO_CONSECUTIVE_KEPT_LINE_VERTICES_UNJOINED_IS_REFUSED_BY_NAME`
  (a vee whose chord runs through a kept vertex; plants `line-chord-unconstrained`, `line-join-unchecked`)
- `MQ169_LINE_RUNS_UNDER_THE_BOUNDARY_RUNS_OPT_IN_ARE_ONE_STEP_EACH_KIND_LINE_RUN_AND_NONE_IS_TRIED_WITHOUT_IT`
  (plants `run-split-per-vertex`, `runs-without-opt-in`)
- `MQ170_THE_DELAUNAY_POST_PASS_FLIPS_NO_LINE_EDGE` (a chord the criterion flips without the line; plant
  `line-flips-unguarded`)
- `MQ171_A_VERTEX_TWO_LINES_LIST_A_CROSSING_OR_A_SHARED_RUNS_END_IS_KEPT` (plant `line-crossings-unkept`)
- `MQ172_A_LINE_VERTEX_ON_THE_HULL_LEAVES_ONLY_WHEN_BOTH_ROWS_HOLD_AND_PROTECT_HULL_KEEPS_IT_OUTRIGHT`
  (plant `line-rows-unread`)
- `MQ173_A_LINE_NO_STEP_TOUCHES_LEAVES_THE_MESH_AND_EVERY_REPORT_BYTE_BUT_ITS_ROW_AND_ECHO_AS_THE_CALL_WITHOUT_IT`
  (plant `line-sweep-counts-steps`; identity with `lines` left out against `d0f289b` is the out-of-suite figure in §11)
- `MQ174_A_REPLAY_WITH_LINES_IS_THE_FULL_RUNS_PREFIX_BYTE_FOR_BYTE_ACROSS_LINE_RUNS` (plant `stop-one-early`)
- `MQ175_CONTROL_THE_LINE_ROWS_READ_BEFORE_THE_STRUCTURE_REFUSE_ONLY_WHAT_THE_FULL_PATH_REFUSES_AND_CHANGE_NO_BYTE`
  (against `measure-every-candidate`; plant `line-early-short`)

What refused each kept vertex ([#1374](https://github.com/rig-c/core/issues/1374), [implemented]) — `explainKept`
(§2) on the blink's subjects above, the attempt observer over the same run the oracle; plant `KeptPlant` in
`ReductionPlant`:

- `MQ176_EXPLAIN_KEPT_NAMES_THE_REFUSAL_THE_OBSERVER_READ_FOR_EVERY_KEPT_VERTEX_OF_THE_LAST_PASS_AND_LEFT_OUT_CHANGES_NO_BYTE`
  (eight subjects: every kept vertex's refusal text equal to the observer's in its last pass, the reason the test's
  own reading of it, the rows the list's own tally; `budget-exhausted`, `replayed-to-accepted-step`,
  `no-removal-pass` and `protected` each reached; with the field set the mesh and the report less the echo and the
  block are the call's without it; `null` and two wrong strings refused `REDUCE_INPUT_MISSING`)
- `MQ177_CONTROL_A_KEPT_VERTEX_NAMED_BY_ANOTHER_VERTEXS_REFUSAL_IS_RED_BY_VERTEX_AND_ROW`
  (plant `kept-reason-shifted`: each kept vertex named by the next refused vertex's refusal, named by vertex and by
  the row the observer read)

The decisions that change behaviour rather than an interface:

- `MQ40_A_CANDIDATE_THAT_PASSES_AT_THRESHOLD_NINE_AND_FAILS_AT_ONE_IS_NOT_ACCEPTED` (Thresholds, P4)
- `MQ41_A_NONZERO_WARMUP_IS_REFUSED_BY_NAME_AND_NOT_RUN_AS_ZERO` (P10)
- `MQ42_A_SELECTION_FRAME_IS_NEVER_HELD_OUT_AND_AN_EMPTY_HELD_OUT_SET_MAKES_NO_HELD_OUT_CLAIM` (P11)
- `MQ43_MIN_WEIGHT_ZERO_KEEPS_EVERY_POSITIVE_SHARE_ON_THE_GRID_AND_PROTECTED_INFLUENCES_OVER_THE_CAP_ARE_REFUSED` (P19)
- `MQ44_A_REFUSED_TRACE_LEAVES_TRACE_DEVIATION_NOT_MEASURABLE_AND_THE_SOURCE_ACCEPTED_ON_ITS_REQUIRED_ROWS` (P13)
- `MQ45_THE_MOTION_ENTRY_IMPORTS_AND_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE` (P1, P2; held by the install smoke rather than `selftest.ts`) — [implemented, #1230] as `SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`, `MESHCOMPARE_PROBE_SOURCE` in `scripts/install_smoke.ts`

## Termination reasons

[implemented, #1224] Every `reduce` report carries exactly one (`MQ24`). The
type is declared in `src/meshquality.ts`; a `measure` report carries one only
when it could not read the mesh — `unsupported-topology` with
`REDUCE_SOURCE_NOT_ONE_LOOP` — and `null` otherwise. `candidatesTried` counts
every step `reduceMesh` tried: each refinement insertion and each removal
attempted, which is also what `budget.maxCandidates` bounds:

```ts
export type Termination =
  | { reason: 'no-further-valid-reduction'; candidatesTried: number; blockingConstraint: string; stopAfterAccepted?: StopNotReached }
  | { reason: 'budget-exhausted'; candidatesTried: number; budget: number; result: 'best-meeting-every-bound' | 'none-met-the-targets'; stopAfterAccepted?: StopNotReached }
  | { reason: 'replayed-to-accepted-step'; acceptedSteps: number; candidatesTried: number }
  | { reason: 'invalid-input'; code: string; detail: string }
  | { reason: 'unsupported-topology'; code: string; detail: string };
```

[implemented, #1268] `replayed-to-accepted-step` and the optional
`stopAfterAccepted: { requested, acceptedSteps }` on the run's own two
reasons exist only when the input sets `stopAfterAccepted` (§7, *Mechanism 2
— implemented*).

- **no-further-valid-reduction** — every candidate step from the result
  violates a declared constraint; the report names the constraint that blocked
  the last step. It is a local stop, **not** a minimum: the report never says
  "minimal".
- **budget-exhausted** — `maxCandidates` reached. [agreed, rig-parts#126,
  P6 and correction 3] With `best-meeting-every-bound`, the result is the best
  candidate found that meets **every** required bound — it may be accepted,
  and nothing implies more reduction was impossible or that it is optimal.
  With `none-met-the-targets`, **no mesh is returned and nothing is accepted**;
  the report keeps `sourceCounts` and carries no `geometry`.
- **replayed-to-accepted-step** — the input's `stopAfterAccepted` was
  reached; the mesh is the one the call without it held after that many
  accepted operations (one per `acceptedAt` entry, a boundary run counting
  one — #1279), byte for byte. It says nothing about the steps the run would
  have taken next.
- **invalid-input** — a refusal from §1, §3, §5 or §6 by code; no mesh is
  returned.
- **unsupported-topology** — the source is not one loop, a requested
  operation would need a hole or an island cut out (§4), or a deform remap is
  refused (§6); no mesh is returned.

Correction 3, made consistent between this prose and §2's interface: a
candidate's `counts` and `geometry` are `null` exactly when no mesh exists to
measure, and `sourceCounts` is `null` exactly when the source could not be
read as a mesh — a count is never invented to fill the field. Wall time is
never in the document (it would break byte identity); the work figure is
`candidatesTried`, and paired CPU timing is stage D's, measured outside it.

## Stage B scope

[agreed, rig-parts#126] None of the following is a prerequisite for the
first static reduction, and Stage B does not wait for them:

- nonzero physics warm-up (P10 — refused by name until it exists);
- a mandatory finer-grid pass (P14 — the typed flag suffices);
- gating on the traced boundary (P13 — `MQ_TRACE_DEVIATION` is a diagnostic);
- refinement of imported meshes that carry vertex-indexed deform keys (P18).

Stage B may start once this revision is recorded; it does not wait for
parts#126's implementation. What stays distinct: Stage A's control box
remains open until the controls above exist; stages B–D are separate stages;
and downstream production and release-candidate acceptance is parts#126's,
not any stage's here.

## Non-goals

- **No global optimum.** Constrained reduction reports where it stopped and
  why; it never claims the smallest mesh.
- **No anatomy and no intent in rigc.** Region names are echoed, never read.
  Which regions deform, which poses represent the work, which candidate wins:
  parts and the consumer.
- **No pose solver and no new compiler.** The motion comparison poses with the
  core poser that exists; the reduced mesh goes through the ordinary `build`
  and its full gate, with no bypass.
- **No performance claim from counts.** Vertex and triangle counts are not GPU
  or frame-rate evidence.
- **Public and generated assets only.** No private asset, name, screenshot or
  path belongs in this page, its fixtures, its controls or the reports they
  print. Aggregate consumer observations motivate the work and substitute for
  none of the evidence above.
- **No release.** Stage completion does not close #1221 or parts#126 before
  the downstream acceptance parts#126 lists is met.

## Corrections to the issue text, measured on the tree

- #1221 asks to *"state whether an outside-distance metric uses a hole-filled
  silhouette"*. Both existing measurements already do, with **two** fill rules
  (8-connected background for the tracer, 4-connected for the authored-mesh
  fit); §4 records the agreed choice (P12) and keeps the legacy one.
- #1221 lists holes and disconnected islands as cases to support. The format
  forbids cutting either out of one mesh (`traceOutline`, Euler's count), so
  "support" can only mean spanning a hole and bridging or refusing an island;
  §4 states that rather than promising more.
- #1221 refers to *"runtime geometry facilities"* parts can use. The one
  posing entry parts is promised, `rig-c/render`, needs spine-core; the
  core poser that does not has no entry. §0 records the agreed new entry (P1),
  [implemented, #1230] as `rig-c/meshcompare`.
- #1323 reads `COMPARE_UV_CARRIER_NOT_UNIQUE` on the full reduction of
  demo/bottomwear at spacing 12 and 18 as a fold in the result's UVs. Measured,
  it is not one: the refused sample lies on the shared edge in px and 1.35e-10
  uv off it after six-place rounding; every triangle winds one way and the areas
  sum to the outline's. The fault was the comparison's carrier rule, not the
  reducer, and the reducer's rows were right not to see it — `MQ_ORIENTATION`
  counts triangles whose signed Spine-world area is negative outside the A39
  band, and none is. §3, correction 4 records the rule.

