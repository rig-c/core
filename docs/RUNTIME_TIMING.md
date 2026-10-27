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

## Stage 3 CPU microbench (2026-10-27)

This is the scoped [#1589](https://github.com/rig-c/core/issues/1589) CPU measurement for runtime stage 3, not another browser capture. The inputs are the paired public `spineboy/walk` and `raptor/walk` models, Spine exports and atlases. Nova ran Bun 1.4.4 on an Intel Core Ultra 7 265K under the farm's exclusive admission. No renderer, player or adapter is loaded. Both fixtures exercise IK/transform constraints; these timings do not measure the new physics/slider workloads. Those have independent tolerance-zero and allocation controls.

`tools/runtime_stage3_bench.ts` uses the existing microbench's asset reader and official spine-core 4.3.13 arm. Each launch retains 300 same-frame pairs after 120 warmup pairs at 1/60 s, alternating AB/BA, with 1 or 100 instances phased by `(i * 0.07) % 1`. A/A compares identical runtime arms; A/B compares official A with runtime B. AA1/AB1/AA2/AB2 ran first, then the fixed doubling rule reached eight launches of each kind because some rows remained unresolved. It stopped there, without waiting for machine silence.

Runtime-only object wrappers time timeline methods and world/constraint methods; the original receiver and arguments are preserved. Their overhead and argument storage remain in these costs. They are absent from ordinary runtime use. Geometry is timed separately, and total covers `step(dt)` plus `computeVertices()`, including bookkeeping outside the named method timers, so stage medians need not sum to total. The runtime writes reused Float64 geometry; the official arm writes reused Float32 scratch and includes its ordinary clip checks, with no clipping active in these walk states. Readout/frame snapshot assembly is absent on the borrowed-buffer runtime path. These are API costs with those boundaries, not isolated formula costs or whole-frame speed claims.

Before timing, all instances at four states matched official bones, slot colours, attachment vertices, draw order and seven-field event deliveries numerically at tolerance zero, treating signed zeros as equivalent. This is not bit-identical reference evidence. Instrumented and plain runtime `world`, `light`, `shown` and `vertices` buffers matched by `Object.is` at the preflight states and the final timed state; that restoration comparison is confined to these two fixtures without physics. Reference equality is not claimed for every retained timing frame.

The table gives ranges across the eight A/B launch statistics, in microseconds for all N instances. The first column is each launch's median of per-frame runtime/official ratios. p50/p95 use the existing #1589 interpolated percentile helper, rather than the browser protocol's floor estimator. The envelope is fixed from AA1 and AA2 as the maximum absolute paired p05/p95. A direction is reported only when every A/B paired median strictly clears it; otherwise the row stays unresolved.

| Runtime / official | Fixture | N | Stage | Official p50 / p95 µs | Runtime p50 / p95 µs | Paired median µs | A/A envelope µs | Result |
| --- | --- | ---: | --- | --- | --- | --- | ---: | --- |
| 0.675–0.733 | raptor/walk | 1 | timeline | 4.084–6.567 / 6.305–11.319 | 2.851–4.370 / 3.578–6.931 | -2.061–-1.150 | 1.309 | unresolved |
| 1.075–1.105 | raptor/walk | 1 | world+constraints | 2.934–4.543 / 4.582–7.877 | 3.218–4.966 / 3.487–7.056 | 0.232–0.382 | 1.538 | unresolved |
| 0.369–0.393 | raptor/walk | 1 | geometry | 5.120–8.191 / 5.271–9.156 | 1.986–3.023 / 2.136–3.576 | -5.150–-3.110 | 0.210 | runtime lower |
| 0.662–0.689 | raptor/walk | 1 | total | 12.247–19.825 / 16.355–29.631 | 8.381–12.786 / 10.029–20.876 | -6.546–-3.849 | 6.502 | unresolved |
| 0.745–0.774 | raptor/walk | 100 | timeline | 398.950–501.362 / 605.914–819.301 | 298.080–376.233 / 428.071–601.387 | -118.481–-89.071 | 64.771 | runtime lower |
| 0.985–1.008 | raptor/walk | 100 | world+constraints | 335.135–404.558 / 464.548–657.867 | 321.911–377.571 / 422.919–624.531 | -5.720–2.744 | 48.840 | unresolved |
| 0.360–0.380 | raptor/walk | 100 | geometry | 546.543–670.834 / 718.972–1065.225 | 199.813–249.042 / 281.148–393.105 | -404.611–-343.665 | 46.601 | runtime lower |
| 0.663–0.682 | raptor/walk | 100 | total | 1309.630–1583.994 / 1785.342–2508.022 | 861.507–1054.052 / 1164.765–1669.014 | -525.441–-423.578 | 157.076 | runtime lower |
| 0.720–0.763 | spineboy/walk | 1 | timeline | 2.883–4.554 / 5.039–9.145 | 1.972–2.949 / 3.622–7.620 | -0.990–-0.661 | 0.538 | runtime lower |
| 1.405–1.466 | spineboy/walk | 1 | world+constraints | 3.592–5.480 / 5.495–9.082 | 5.259–7.709 / 7.198–11.823 | 1.534–2.290 | 1.787 | unresolved |
| 0.750–0.778 | spineboy/walk | 1 | geometry | 2.875–4.181 / 3.165–5.055 | 2.167–3.220 / 2.369–3.580 | -0.934–-0.693 | 0.217 | runtime lower |
| 1.049–1.082 | spineboy/walk | 1 | total | 9.742–14.639 / 14.874–25.697 | 10.203–15.325 / 15.390–26.034 | 0.497–1.198 | 4.499 | unresolved |
| 0.869–0.917 | spineboy/walk | 100 | timeline | 151.415–198.149 / 235.386–344.392 | 137.516–175.200 / 184.985–301.198 | -21.853–-14.804 | 40.946 | unresolved |
| 1.230–1.270 | spineboy/walk | 100 | world+constraints | 213.320–284.639 / 281.449–453.969 | 263.145–340.033 / 327.186–554.860 | 51.611–63.783 | 43.556 | runtime higher |
| 0.330–0.348 | spineboy/walk | 100 | geometry | 210.490–275.247 / 260.008–418.556 | 70.567–95.483 / 90.925–151.619 | -175.184–-136.609 | 18.757 | runtime lower |
| 0.839–0.859 | spineboy/walk | 100 | total | 583.704–778.229 / 770.187–1247.566 | 500.146–638.368 / 634.807–1060.465 | -102.727–-80.952 | 86.112 | unresolved |

Eight of the sixteen rows remain unresolved. In particular, the 100-instance spineboy world/constraint stage is measurably higher; its total remains unresolved despite ratios below one. The 100-instance raptor total is lower under this instrument. Neither is a player or renderer result.

Before AA1, the 30 µs world-stage work plant shifted that stage by 29.969 µs, timeline by -0.163 µs and geometry by -0.0015 µs. The separate uninstrumented allocation child read 0 B/frame; its object plant read 32.768 B/frame. Allocation is collector-off heap growth (`BUN_JSC_useGC=0`), after 3,000 warmup frames, the least of three 4,000-frame batches. Stage-three physics and slider-physics controls independently also read 0 B/frame and detected their plants. Timing-wrapper allocations are not represented as zero.

Evidence SHA-256 (raw files retained privately on Nova):

| Record | SHA-256 |
| --- | --- |
| Measured source freeze manifest | `a8f5d4cb16b5effbc08a06c3a1dc34299c63549f8340797ebd66239048d59a9c` |
| Microbench summary, eight A/A and eight A/B launches | `df77fd7a9cf86657f1ed2efc9f22468cd2f03ea8e57dd9a48cccab871d8d3e08` |
| Calibration | `a85e133ebcdd1825077cd5a99057d6de2072ecd0ee5e61d48eafcea69a8eb04e` |

