# Browser timing protocol for the runtime poser

Correctness and timing answer different questions. The runtime poser is held to
the core oracle at tolerance zero; this does not establish a speed improvement
in a player. A browser measurement needs a reader that proves what it loaded,
what it drew, and which configurations it compared before it starts sampling.
This contract follows [core#1609](https://github.com/rig-c/core/issues/1609) and
[the hardware comparison](https://github.com/rig-c/adapters/blob/main/bench/HARDWARE-62.md).
The diagnostic results below do not establish a product speed gain.

## Ownership and provenance

Core owns the poser contract and this measurement protocol. A Playwright runner,
its browser dependencies, fixture copies and raw machine reports belong to the
consumer's private capture workspace, outside the core package. No browser
harness or dependency is added to core for this protocol.

Freeze acceptance bars, source and output hashes, package versions and integrity,
fixture hashes, engine/animation identities, renderer options, clocks and sample
counts before timing. A bundled player embeds its core: installing another core
beside it does not replace those bytes. Verify embedded source maps against the
intended core sources. A package-version comparison includes every changed
player module; it is not automatically evidence for a causal poser-only gain.

For an oracle/default comparison, A explicitly selects the oracle and B uses the
product's default selection. A/A uses the same oracle configuration on both
sides. Both arms use identical player modules and renderer settings. Record the
actual selected poser on every animation; a default fallback remains a fallback
control, never a forced runtime result. Preserve normal event delivery.

If browser-native package imports are needed to exercise an alias, rebuild the
same published player sources with those imports preserved, hash the inputs and
outputs, and compare its default selection, exact frames and pixels with the
published product before timing. The resolver mutant must change the imports
of the product actually measured. An unused diagnostic import beside a
self-contained bundle cannot prove that bundle's loader was checked.

Equal source bytes and renderer classes do not prove equal data paths. For
example, a native player can feed borrowed runtime buffers to its renderer and
create detached snapshots for the oracle. The measured configuration comparison
then includes that conversion; report it rather than attributing the whole
difference to pose arithmetic. A legacy adapter consuming snapshots is a
separate workload.

## Official reference comes first

A timing table must lead with a **rig-c / official reference ratio** for the
same fixture, animation state, instance count and browser frame. Use
`spine-pixi-v8` when comparing the same Pixi rendering workload, or official
`spine-core` for a pose-and-world-geometry workload that draws on neither arm.
The rigc core oracle is rigc's own model poser; it is **not** official spine-core.
Historical captures, including a 100-instance workload, establish provenance
only and cannot supply a current reference timing.

For a pose-only capture, pin the official package and parse the fixture's paired
Spine export and atlas. Prove its animation identities, durations, bones,
attachment vertices, colours, draw order and events agree with the model-based
product under the exact initial state, loop and step schedule before sampling.
Fix physics clocks explicitly; a product using `physicsClockStep(dt)` needs the
same clock in the reference. Unsupported semantics refuse by name rather than
being silently removed from the denominator.

State the exact timed APIs. For example, product `advance(dt)` includes its
native geometry and internal buffer updates, while the official path includes
setup, animation application, skeleton/world update and world-vertex computation.
Keep caller snapshot conversion, equivalence checks and drawing outside both
intervals. Any intrinsic snapshot, metadata or clipping work one native API
performs must be disclosed; this compares those APIs, not isolated arithmetic.

Retain per-frame ratios `current / official` and report their median for each
repeat. Every denominator must be finite and strictly positive; zero and
nonfinite values refuse, without a floor. A ratio of separate medians is a
different statistic and must not be substituted. Every timing table places that
reference ratio first, including tables presenting secondary differences.

The secondary previous/current comparison uses the actual pinned previous and
current published products. It is distinct from the original oracle/default
diagnostic, which compares rigc's own two configurations. Label all three
accurately and apply their own A/A envelopes; own-versus-own evidence cannot
establish a gain against the official reference. No optional metric is implied.

## Real-browser preflight

Run the exact final manifest and complete loader chain in every measured browser
engine before any timing sample. The browser must load the actual product entry,
resolve all its runtime imports, read every model and referenced page, select
and advance each animation, and draw through the chosen renderer. An import or
syntax check alone does not admit measurement.

The following are **capture harness refusals**, not compiler assertions. Each
needs a positive control and a planted defect where its workload applies. A
pose-only capture checks `REFERENCE_STATE_MATCH` against official bones,
attachment geometry, colours, order and events; it reports pixel/render
checks as unmeasured because it draws on neither arm. Drawing workloads also
require the pixel and renderer rows below. A refused preflight records zero
timing samples and prevents AA1.

| Refusal | What must be observed in the actual browser |
| --- | --- |
| `PREFLIGHT_PACKAGE_ENTRY` | The configured core alias resolves to the target declared by `package.json`'s `exports["./core"]`, with all consumed value exports available. Plant the internal-index alias in the actual product loader; a missing export such as `REGION_TRIANGLES` must refuse by name. Restore the declared entry and load successfully. |
| `PREFLIGHT_RUNNER_UNBOUND` | The same serialized evaluated runner used by capture executes with every input passed explicitly. Plant a free identifier such as `probeOnly` in that callback and catch its browser `ReferenceError` by name before sampling. Host-side lexical scope is not transferred into browser evaluation. |
| `REFERENCE_STATE_MATCH` | For pose-only reference comparisons, the official and product fixture identities, durations, animation state, bone transforms, attachment vertices, slot colours, draw order and events agree exactly outside timing. A planted bone/vertex/event discrepancy must fail by name. |
| `PREFLIGHT_NUMERIC` | Exact frame values and attachment identities agree with the oracle. Compare doubles with `Object.is`; name the first differing field. A planted differing value must fail. |
| `PREFLIGHT_PIXEL` | Both arms produce nonempty drawable content with matching dimensions and pixel values at the fixed control times. Missing or empty pictures are unmeasured, not equal pictures. A planted pixel discrepancy must fail. |
| `PREFLIGHT_EVENT` | Delivered event records and order agree. A planted differing delivery must fail; muting events is not a repair. |
| `PREFLIGHT_RENDER_PATH` | Actual backend and per-frame draw/reuse statistics agree. Report legitimate zero draws on unchanged frames; do not import another fixture's draw-call cap. |

After those untimed checks, run a separate calibration, excluded from A/A and
A/B: busy work only in B must move the paired CPU result in the known direction.
The hardware comparison's control uses 12 ms of work and requires a shift above
8 ms. A missing, failed or unavailable control refuses the capture. Revalidate
input hashes and preflight identity when launching each measured phase.

## Pairing, dimensions and judgment

Use AA1, AA2, AB1, AB2 in that order, with fresh headful browser launches; both
A/A launches finish before either A/B. Keep the same fixed workload on both
arms, step both in one animation-frame callback, and alternate AB/BA order each
frame. Fix warmup and retained sample counts before measuring; the hardware
comparison uses 60 warmup and 180 retained pairs. Instance count, canvas layout,
DPR, time step and renderer path are workload parameters, not implicit defaults
to borrow from another capture.

An engine is part of a row's identity. A corpus of 29 animations repeated in
Chromium and WebKit has **58 engine rows**, not 58 animations per engine or 58
distinct fixtures. Each launch retains 180 pairs per engine row in this example;
all four launches retain 41,760 pairs per comparison. Preserve unsupported/fallback rows and
report their denominator alongside the covered runtime rows.

For each comparison, engine, animation, workload and metric, compute the paired difference
**B minus A** on each retained frame. For a sorted series of length `n`, quantile
`p` is the element at `floor((n - 1) * p)`. Freeze the A/A envelope as:

```text
E = max(abs(AA1.p05), abs(AA1.p95), abs(AA2.p05), abs(AA2.p95))
improvement only if AB1.p50 < -E AND AB2.p50 < -E
```

The inequalities are strict, including when `E` is zero. Both A/B medians must
clear the envelope independently. Separate arm medians need not subtract to the
paired median. A single favorable repeat, an aggregate across engines, or an
A/B median merely below zero is insufficient. Otherwise report **unresolved by
the A/A envelope**; no measured gain is a valid result. Both repeated medians
above `E` can similarly establish a regression for that workload.

Keep advance/pose CPU wall time, draw/submission CPU wall time and their combined
CPU time separate. CPU completion or `gl.finish` wall time is not per-arm GPU
execution, FPS or input-to-present latency. If GPU timers are not used, report
GPU execution time as unmeasured. Reject missing phases/engines, duplicate rows,
wrong sample counts, zero or nonfinite official denominators, nonfinite values and broken source pins in the summary
reader; plant those faults before accepting its output.

## Receipts and boundaries

Retain commands, exits, raw paired samples, controls, hashes, exact package and
browser pins, full device observations, actual backend, phase ordering and
cleanup receipts privately. Public machine details are limited to GPU, driver
and browser versions. Bulk raw results belong in the designated evidence store;
a public protocol or ledger retains small summaries and hashes.

A local exclusive capture excludes other jobs using that admission mechanism;
it does not prove the whole OS was idle. Record background-load observations,
release the slot between bounded phases, close only the capture's own browsers
and server, and name unavailable GPU or host observations. Preserve rejected
runs as rejected. A wider A/A envelope cannot certify that persistent contention
or later drift disappeared.


## Measured diagnostic results (2026-10-27)

These results use 100 instances per arm of the public adapter fixtures `spineboy/walk` and `raptor/walk`, with their exact model, paired Spine export, atlas and page hashes pinned before sampling. They do not reuse historical timings. The player is the actual published `@rig-c/play` 1.20.0; the official runtime/provider is 4.3.13 and Pixi is 8.22.0. Browser: Chromium 151.0.7922.34. These are scoped CPU wall-time diagnostics, not an untouched reproduction of an earlier adapter benchmark or GPU execution measurements.

Each diagnostic has two A/A launches followed by two measured repeats (M1/M2), 60 warmup and 180 retained frames per fixture per launch, `dt = 1/60`, fixed instance phases, same-frame pairing and alternating arm order. Every timing table leads with the median of per-frame stage/reference ratios. Absolute milliseconds are per 100 instances. Envelopes use the two-launch p05/p95 definition above, separately for each stage. Native adapter A/A compares identical product groups; standalone-core A/A compares two official groups. No optimisation is substituted between M1 and M2.

The native adapter reference times `Spine.update(dt)` with normal state/event processing; the current path advances each player and materialises the detached frame consumed by Pixi. Geometry checks cover group 0 instances 0 and 99 at sampled frames, not all 100 instances. The comparisons use the adapter’s Float32 geometry contract and explicit clocks. Per-instance stopwatch boundaries add overhead relative to the official group timer. Snapshot/build and host drawing are distinct intervals; host GPU submission/completion is outside the reported intervals.

Official Spine.update defers attachment geometry to rendering; current advance includes it, so native ratios are not equal-work arithmetic.

### Table 1 — actual player poser selection

Each of the 100 individual players was read before and after a positive advance. Both fixtures have zero walk draw-order keys and no active clipping in the observed states. Spineboy has seven IK and seven transform constraints; raptor has nine IK constraints. This rejects the fallback premise for these observations, not every possible animation state.

| Fixture | Instances | Before | After |
| --- | ---: | --- | --- |
| spineboy/walk | 100 | 100 runtime | 100 runtime |
| raptor/walk | 100 | 100 runtime | 100 runtime |

### Table 2 — native adapter stages

`advance` and detached `posedFrame()` snapshot are measured per instance in their actual call order; adapter build consumes those `PosedFrame` values. The combined pose row measures advance plus snapshot, including loop/clock overhead; it is separate from adapter build. Stage medians need not add to the combined median. The first column is each row’s own stage ratio, not the combined pose ratio repeated across stages.

| Stage / official update, M1 / M2 | Fixture | Stage | Stage ms, M1 / M2 | Own A/A envelope ms |
| --- | --- | --- | --- | ---: |
| 1.885 / 1.879 | raptor/walk | advance | 10.250 / 10.000 | 2.990 |
| 5.702 / 5.841 | raptor/walk | detached snapshot | 31.300 / 30.655 | 9.505 |
| 1.619 / 1.714 | raptor/walk | adapter build | 9.095 / 9.035 | 6.255 |
| 7.651 / 7.790 | raptor/walk | advance + snapshot (combined) | 41.900 / 41.065 | 11.050 |
| 2.116 / 1.995 | spineboy/walk | advance | 7.040 / 5.815 | 2.510 |
| 4.855 / 4.336 | spineboy/walk | detached snapshot | 15.815 / 12.265 | 5.145 |
| 1.424 / 1.304 | spineboy/walk | adapter build | 4.645 / 3.960 | 2.450 |
| 7.173 / 6.357 | spineboy/walk | advance + snapshot (combined) | 23.655 / 18.205 | 6.195 |

Detached snapshot is the largest of the three measured stages in both fixtures and repeats, and its cost exceeds its own A/A envelope. Median per-frame snapshot/combined-pose shares are 68.837% / 67.857% for spineboy and 75.286% / 75.169% for raptor. These are paired-frame shares, not ratios of separate medians, and do not prove a counterfactual optimisation or exclusive root cause.

### Table 3 — standalone core with world geometry

No play or Pixi module is loaded. Candidate timing is `RuntimePose.step(dt)` plus `computeVertices()`. The official path uses the model’s paired built export: setup pose, `Animation.apply`, world update with `Physics.none`, and world vertices into reused buffers. Both fixtures contain IK/transform constraints only; this does not establish physics or unsupported-semantic parity. Event records are collected symmetrically with no subscribed callbacks on either arm. Readback/equivalence is outside timing. The untimed positive probe covers all 100 instances at three states; retained-frame checks cover endpoints 0 and 99. Full doubles agree with counted physical signed-zero equivalence; this is not bit-identical evidence.

| Core / official, M1 / M2 | Fixture | Core ms, M1 / M2 | Official ms, M1 / M2 | Paired delta ms, M1 / M2 | A/A envelope ms | Verdict |
| --- | --- | --- | --- | --- | ---: | --- |
| 0.819 / 0.817 | raptor/walk | 4.860 / 4.840 | 5.885 / 5.840 | -1.055 / -1.055 | 1.575 | unresolved by A/A |
| 0.844 / 0.848 | spineboy/walk | 2.970 / 3.075 | 3.490 / 3.580 | -0.510 / -0.530 | 2.230 | unresolved by A/A |

Neither fixture clears its A/A envelope. Ratios below one establish neither superiority nor equality.

### Table 4 — inside the actual player advance

The published runtime path calls `RuntimePose.apply(time)`, not `RuntimePose.step(dt)`: it advances the track clock itself, calls `apply`, then `RuntimeFrames.update`. Private per-object wrappers time the original `apply` with its original receiver, arguments and return; no installed source, algorithm or model is changed. Every group/frame records 100 actual `apply` calls and zero `step` calls. This corrects the proposed literal step boundary rather than replacing the executed path with a standalone-core surrogate.

`play other = outer advance wall time − summed inner apply wall time`. It includes `RuntimeFrames.update`, attachment geometry (`computeVertices`), colour/draw bookkeeping, clocks/event handling outside `apply`, and instrumentation/subtraction overhead. Inner `apply` retains its own event collection and core bookkeeping. Snapshot, adapter build, state readback and drawing are outside this advance interval. Untimed wrapped/unwrapped frame and time comparisons pass for all 100 instances at three states in each fixture; official geometry checks retain the endpoint limit of Table 2. The private bundle is byte-identical to published 1.20.0; wrappers are object-local. This is a different instrumented launch series from Table 2, so its absolute costs must not be spliced into that table.

| Stage / official update, M1 / M2 | Fixture | Inside-advance quantity | Stage ms, M1 / M2 | Own A/A envelope ms |
| --- | --- | --- | --- | ---: |
| 1.394 / 1.323 | spineboy/walk | actual core apply | 3.685 / 4.145 | 4.195 |
| 0.644 / 0.591 | spineboy/walk | play other (subtraction) | 1.690 / 1.875 | 2.090 |
| 1.159 / 1.164 | raptor/walk | actual core apply | 5.715 / 5.895 | 6.965 |
| 0.761 / 0.728 | raptor/walk | play other (subtraction) | 3.765 / 3.730 | 4.475 |

These split quantities describe observed cost with their own A/A noise; they are not an isolated poser gain, and native reference ratios remain unequal-work ratios.

### Evidence status and rejected conclusions

The full 58-engine-row product preflight completed before its first A/A capture, including actual-loader wrong-entry and evaluated-runner unbound-identifier mutants. Its denominator is 29 animations × Chromium/WebKit: 30 runtime and 28 fallback rows across both engines. The workload was fixed at 100 instances before sampling. The first A/A capture is preserved; the remaining A/A and both product A/B launches were cancelled by the final work order. There is no completed previous/current or oracle/default product gain verdict. Published 1.19.0 and 1.20.0 were pinned, but their changed player modules preclude calling that package comparison an isolated poser experiment.

For Tables 1–3, all browser payload commands and 22 raw-reader controls completed, but the enclosing execution wrapper exited **1** at metadata capture: `work changed during artifact capture`. Its output directory overlapped the measured root. Direct raw files were re-read and independently hash-verified; that supports the scoped tables, not a green or fully sealed whole-job claim. The later inside-advance capture uses an external tool-output directory. Six additional raw-reader controls reject missing/empty data, nonfinite costs, zero reference denominators and incorrect method-call counts before accepting its summary.

The earlier exactly-once full core selftest passed: 93 suites, 2,651 anchored PASS lines, zero anchored FAIL lines, no reported HOLEs; its input matched all 21 embedded current core modules. Typecheck and lint also passed. This document’s final results were added after that full run; only the guide targeted suite validates the final documentation revision. No second full run is implied.

Evidence digests (SHA-256, private raw locations omitted):

| Record | SHA-256 |
| --- | --- |
| Accepted cause receipt, Tables 1–3 | `62ce2612f6aefdb9881fc2849410a9f7c07b69b32ddee7591cd1a4283148e96a` |
| Cause summary | `de819235547c178baf5369d2f795ee5a12678f12b06bcffe9471095385702a6e` |
| Inside-advance summary | `062e4d9b3e700d36e38101d5899c35ecd1f4e3e16462ae102dda113887e5cc6b` |
| Inside-advance source/fixture manifest | `e3b74beb0be4acdce2618cbb20d5af464746170b5902929f974e98e8aa351416` |
| Earlier full selftest receipt | `666c4b0312997b18de7797264d5b3f89b62d4162f28518790b21ce98124264cd` |
