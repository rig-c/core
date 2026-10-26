/**
 * Two triangulations of one attachment compared in motion — the pose/motion
 * half of the contract in docs/MESH_REDUCTION.md (issue #1221, stage C1:
 * issue #1230).
 *
 * One operation lives here, `compareMeshesInMotion`: a reference build and one
 * or more candidate builds of the same rig — the same rig with one
 * attachment's mesh replaced (P8) — posed through rigc's own core over each
 * build's model document, every candidate compared with the reference on the
 * attachment's region UV square (§3), into one `mesh-quality-report/1`
 * document with `operation: 'compare'` (`writeMeshQualityReport` writes its
 * text; no second format).
 *
 * ## What it is for
 *
 * A reduced mesh is fewer vertices carrying the same art. Whether it still
 * moves like the mesh it came from is a question no geometry row answers: a
 * bend needs vertices where it bends, and a mesh without them passes every
 * coverage bound at the setup pose and folds the art at the first key. So the
 * candidate and the reference are posed on one schedule, and the art they
 * carry — the same texel, named by its UV, which no deform and no repack moves
 * — is compared in world units at every frame.
 *
 * ## The comparison, as implemented
 *
 * - **Poser.** `src/core/` over the model document (`readModel`), the walk
 *   `src/render_core.ts` poses an animation with — `poseRawAnimationEach`,
 *   the reset taken at the animation (`'animation'`) — and `poseRawSetup` for
 *   the setup pose; a skin is posed as `underSkin`, no skin as `underNoSkin`
 *   (what `noSkinView` in `src/render_core.ts` is). Nothing here links
 *   spine-core (`CUR07`), and the report says which poser ran (`poser`, P2).
 * - **Equality (correction 5).** Every input of the two model documents is
 *   compared, leaf by leaf, except the allowlist `ALLOWED` states; the first
 *   difference refuses the call (`COMPARE_INPUTS_DIFFER`) naming its path and
 *   both values.
 * - **The domain (correction 4).** The centre of every art pixel of the mask
 *   at the final threshold, carried to UV as `((x + 0.5) / w, (y + 0.5) / h)`,
 *   plus every reference hull vertex's UV. Each sample is carried by the UV
 *   triangle that contains it — barycentric, each coordinate at least `−1e-9`,
 *   the predicate epsilon of `src/mesh.ts` — in the reference and in each
 *   candidate, never by vertex index. A UV triangle inside the A39 area band
 *   (`areaBand` over the UVs) carries nothing. Two carriers are one hit only
 *   when the sample lies on a vertex or an edge both share (the same vertex
 *   indices carry it in each); any other pair is `COMPARE_UV_CARRIER_NOT_UNIQUE`.
 *   A sample no triangle carries is counted and listed, never dropped silently.
 * - **The distance.** At each frame the carried point is the barycentric
 *   combination of the carrying triangle's posed world vertices — the raw
 *   pose's own doubles, weighted vertices through their bones. The row is the
 *   largest distance between the candidate's and the reference's carried point
 *   over the finite sample set and the frames, in world units. Alignment is by
 *   construction (one rig, one schedule); nothing is fitted.
 * - **Stretch and inversion.** Each candidate triangle's map from its setup
 *   world triangle to its posed one: `stretchSingularValues` (`src/areaband.ts`),
 *   and A39's rule for a reversal — the band over the setup and the posed
 *   areas, a triangle with no setup area skipped, one collapsed onto zero not
 *   reversed. A slot `invariants.deformMayFold` names is exempt from the count's
 *   bound and its folds are listed.
 * - **The reference (P8, §3 *Independent evidence*).** Each build's art fit at
 *   the setup pose is measured under its own bounds — the reference under
 *   `referenceArtFit`, each candidate under `candidateArtFit` — and a reference
 *   whose coverage, overshoot or undercut fails its bound is refused (`COMPARE_REFERENCE_FAILS`), never
 *   compared against. (b), the gate on each build, is where it runs: `build`
 *   writes the model document only after every assertion passed, and this
 *   module, handed the document's text, does not run it a second time.
 * - **Schedule (P10, P11).** Frames by `FrameRef.id`; physics reset at time 0
 *   on every walk and stepped at the declared `dt` to each frame (the oracle's
 *   `stepSchedule` rule: from the last frame, steps of `dt` while before the
 *   next, then to it), the same steps for the reference and every candidate. A
 *   nonzero `warmupSteps` is refused, never run as zero. The physics clock
 *   moves by `physicsClockStep` of each step, the render's clock
 *   (`PHYSICS_CLOCK_LEAD` in `src/core/raw.ts`, issue #1380), so a step
 *   lasting a whole number of a constraint's steps takes them as exact
 *   arithmetic does (`comparisonWalk`, issue #1389).
 *
 * ## What it never does
 *
 * - Invent a bound, a frame or a split: rows with no bound are `undeclared`,
 *   the frames are the caller's, selection membership is the caller's.
 * - Pose through spine-core, or reach the compiler.
 * - Put a time, a path or a machine in the document.
 */
import { artOf, MeshReductionError, r6 } from './mesh.ts';
import {
  measureMeshQuality,
  MESH_QUALITY_REPORT_SPEC,
  validateMotionAmplitude,
  type ArtFitBounds,
  type ArtInput,
  type AttachmentRef,
  type CandidateReport,
  type EffectiveSettings,
  type EvidenceSection,
  type FrameRef,
  type MeasureRow,
  type MeshCounts,
  type MeshQualityReport,
  type MotionAmplitude,
  type MotionBounds,
  type MotionReading,
  type MotionRowDetail,
  type MotionSchedule,
  type OverBoundReport,
  type OverBoundRequest,
  type OverBoundRow,
  type ScheduleUsed,
  type TriangleMaxima,
  type SourceMesh,
  type WorstSample,
} from './meshquality.ts';
import { createHash } from 'node:crypto';
import { areaBand, stretchSingularValues, triangleAreas } from './areaband.ts';
import { uvCarriers, uvCarriersWith, type Carrier, type CarrierPlant } from './meshcarriers.ts';
import { CoreInputError, readModel, underNoSkin, underSkin, type CompiledDocument } from './core/index.ts';
import { physicsClockStep, poseRawAnimationEach, poseRawSetup, type RawPose } from './core/raw.ts';
import { sampleTime, type TimelinePlant } from './core/animation.ts';
import { CORE_DEFAULT_SKIN } from './core/skins.ts';
import { readVersion } from './package_meta.ts';
import { hypot2 } from './numeric.ts';

// ---------------------------------------------------------------------------
// the input — §3, with what the contract left undefined defined here
// ---------------------------------------------------------------------------

/**
 * One build compared — the reference or a candidate. The contract's
 * revision 2 names three paths (`modelPath`, `skeletonPath`, `atlasPath`);
 * stage C1 takes the model document's TEXT instead, because the core poses the
 * document and nothing else (the Spine pair beside it is never read), and a
 * module under `src/` that opened paths would tie the call to a disk layout.
 */
export interface BuiltCandidate {
  /** Correction 1: the caller's identity for the build, unique within one call, echoed in its report. */
  id: string;
  /** The build's `skeleton.model.json`, as `build` wrote it. */
  model: string;
}

/** One attachment compared: its own art, threshold, frame and sample floors (correction 1, P9). */
export interface CompareAttachment {
  attachment: AttachmentRef;
  art: ArtInput;
  /** P4: the final acceptance threshold. Samples and the setup art fit are taken at it. */
  finalThreshold: 1;
  /** P9: the fewest art samples the attachment's local-deformation row is taken over. */
  minArtSamples: number;
  /** Regions, part-local drawing px, y down; each region's samples are those whose UV falls in its closed polygon. */
  regions: Array<{ name: string; polygon: Array<[number, number]>; minArtSamples: number }>;
}

/**
 * Everything `compareMeshesInMotion` reads. §3's interface, with three fields
 * it did not have, each one the agreed text requires an input for:
 * `motionRequired` (P6), `perFrame` (P7's opt-in), and `schedule` may be null
 * (P6: no motion supplied leaves `motion` null rather than an empty pass).
 */
export interface MotionComparisonInput {
  /** P8: the unreduced, independently gated source build. */
  reference: BuiltCandidate;
  candidates: BuiltCandidate[];
  attachments: CompareAttachment[];
  referenceArtFit: ArtFitBounds;
  candidateArtFit: ArtFitBounds;
  schedule: MotionSchedule | null;
  bounds: MotionBounds;
  motionRequired: boolean;
  perFrame: boolean;
  /**
   * Issue #1291: the motion amplitude the setup art fit's measurement reads — `MeshMeasureInput.motionAmplitude`, the
   * same shape and the same handling, handed to that measurement of every build and to nothing else (no frame, no
   * motion row and no acceptance reads it). Left out, it is not declared and the setup sections' `MQ_DEFORM_LOAD`
   * and `MQ_ALLOCATION_CONTRAST` are `not-measurable` naming it, as before the field existed; `null` declares it
   * absent; set, `MQ_DEFORM_LOAD` is measured on each build's setup section. `MQ_ALLOCATION_CONTRAST` stays
   * `not-measurable` there either way, naming `targets.maxBoundaryDeviation`: the comparison declares no deviation
   * bound and no reference hull. Anything that is not a `MotionAmplitude` in full is refused `COMPARE_INPUT_MISSING`
   * before any build is read, in the measurement's words. Echoed in `effective` when set, `null` included.
   */
  motionAmplitude?: MotionAmplitude | null;
  /**
   * Issue #1315: asks each candidate's report for where its motion rows broke — the samples over each declared
   * `MQ_LOCAL_DEFORMATION` bound (the attachment's row and each measured region's), each with the frame of its worst
   * value and the candidate's UV triangle that carries it, at most `maxSamples` per row, worst first, with the count
   * of all of them; and each candidate triangle's worst value of every declared motion row over the selection frames
   * (`triangles`: the over-bound triangles, or `all` with a reading). Nothing else moves: no row, verdict, acceptance
   * or byte of a report without it. Left out, not asked; anything that is not an `OverBoundRequest` in full — `null`
   * included, since asking for nothing is leaving the field out — is refused `COMPARE_INPUT_MISSING` naming the field,
   * before any build is read. Echoed in `effective` when set.
   */
  overBound?: OverBoundRequest;
}

/** The candidate list is supplied on each use; every other input is bound to the reference. */
export type MotionReferenceInput = Omit<MotionComparisonInput, 'candidates'>;

/** An opaque reference prepared by {@link prepareMotionReference}. Its data is held outside the returned object. */
export interface PreparedMotionReference { readonly kind: 'prepared-motion-reference/1' }

/**
 * Issue #1291's faults in carrying `motionAmplitude` into the setup measurement, for the `mesh-compare` suite's
 * negative controls: the amplitude not handed over; `null` handed over as the field left out; the field not validated
 * before the builds are read; `null` echoed for a field left out; and the load counted as a required row, so the
 * amplitude moves a verdict. `compareMeshesInMotion` plants none. Issue #1389 adds `'frame-physics-clock'`: every
 * build posed with the physics clock moved by the schedule's step itself, the walk before that issue
 * (`comparisonWalk`). Issue #1323 adds `CarrierPlant`
 * (`src/meshcarriers.ts`): a fault in resolving a sample's several carriers, planted in every `uvCarriers` the
 * comparison reads.
 */
export type ComparePlant =
  | 'amplitude-not-carried'
  | 'null-read-as-left-out'
  | 'amplitude-unvalidated'
  | 'echo-when-unset'
  | 'amplitude-gates-acceptance'
  | 'frame-physics-clock'
  | OverBoundPlant
  | CarrierPlant;

/**
 * Issue #1315's faults in `overBound`, for the `mesh-compare` suite's negative controls: a listed sample's triangle
 * taken from the reference's carrier rather than the candidate's; the samples listed in domain order rather than worst
 * first; the total counted off the listed samples; the per-triangle table read over every frame rather than the
 * selection's; the field echoed when left out; and the field not validated, so `null` and a malformed request pass.
 */
export type OverBoundPlant =
  | 'over-bound-reference-carrier'
  | 'over-bound-domain-order'
  | 'over-bound-total-is-listed'
  | 'over-bound-table-every-frame'
  | 'over-bound-echo-when-unset'
  | 'over-bound-unvalidated';

// ---------------------------------------------------------------------------
// fixed tolerances — the tree's own
// ---------------------------------------------------------------------------

/** §3 *Independent evidence* (a): the rows a reference is refused on — its art fit against its own mask, and only that. */
const REFERENCE_ART_FIT: readonly string[] = ['MQ_COVERAGE', 'MQ_OVERSHOOT', 'MQ_UNDERCUT'];

/** The predicate epsilon of `segmentsMeet` and `prunePolygon` (`src/mesh.ts`), for a region's closed boundary. */
const ON_BOUNDARY = 1e-9;

// ---------------------------------------------------------------------------
// refusals
// ---------------------------------------------------------------------------

function refuse(code: string, message: string): never {
  throw new MeshReductionError(code, message);
}

function nameOf(ref: AttachmentRef): string {
  return `${ref.skin ?? '(no skin)'}/${ref.slot}/${ref.attachment}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function missing(field: string, found: unknown, required: string): never {
  refuse('COMPARE_INPUT_MISSING', `${field} is ${JSON.stringify(found)}; required ${required} — no field has a default`);
}

function validateFit(field: string, f: unknown): void {
  // `null` on maxOvershoot or maxUndercut is a bound declared absent (issue #1254): measured, reported `undeclared`,
  // never refusing a reference or failing a candidate. A field left out is still refused.
  const distance = (v: unknown): boolean => v === null || (isFiniteNumber(v) && v >= 0);
  if (!isObject(f) || !isFiniteNumber(f.minCoverage) || f.minCoverage < 0 || f.minCoverage > 1 || !distance(f.maxOvershoot) || !distance(f.maxUndercut)) {
    missing(field, f, '{ minCoverage in 0..1, maxOvershoot >= 0 or null, maxUndercut >= 0 or null }');
  }
}

/**
 * Everything the comparison refuses before a document is read, by code. The
 * art itself (mask, threshold, frame) is `measureMeshQuality`'s to refuse, by
 * its own codes, when the setup art fit is taken.
 */
function validateInput(input: MotionComparisonInput, plant: ComparePlant | null): void {
  if (!isObject(input)) missing('the input', input, 'a MotionComparisonInput object');
  const builds = [input.reference, ...(Array.isArray(input.candidates) ? input.candidates : [])];
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) missing('candidates', input.candidates, 'a non-empty list of builds');
  const ids = new Map<string, number>();
  builds.forEach((b, i) => {
    const who = i === 0 ? 'reference' : `candidates[${i - 1}]`;
    if (!isObject(b) || typeof b.id !== 'string' || b.id === '' || typeof b.model !== 'string') missing(who, b, '{ id: a non-empty string, model: the model document text }');
    const before = ids.get(b.id);
    if (before !== undefined) {
      refuse('COMPARE_INPUT_MISSING', `${who} has the id "${b.id}" that ${before === 0 ? 'reference' : `candidates[${before - 1}]`} has; required every build's id unique within one call (correction 1)`);
    }
    ids.set(b.id, i);
  });
  if (!Array.isArray(input.attachments) || input.attachments.length === 0) missing('attachments', input.attachments, 'a non-empty list of the attachments compared');
  const seen = new Set<string>();
  input.attachments.forEach((a, i) => {
    const at = `attachments[${i}]`;
    if (!isObject(a)) missing(at, a, 'a CompareAttachment object');
    const ref = a.attachment;
    if (!isObject(ref) || typeof ref.slot !== 'string' || ref.slot === '' || typeof ref.attachment !== 'string' || ref.attachment === '' || !(ref.skin === null || typeof ref.skin === 'string')) {
      missing(`${at}.attachment`, ref, '{ skin: string | null, slot: string, attachment: string }');
    }
    const key = nameOf(ref);
    if (seen.has(key)) refuse('COMPARE_INPUT_MISSING', `${at}: attachment ${key} is listed twice; required each attachment once`);
    seen.add(key);
    if (a.finalThreshold !== 1) missing(`${at}.finalThreshold`, a.finalThreshold, '1 — P4: the final acceptance is measured at alpha >= 1');
    if (!Number.isInteger(a.minArtSamples) || a.minArtSamples < 1) missing(`${at}.minArtSamples`, a.minArtSamples, 'a whole number >= 1 (P9)');
    if (!Array.isArray(a.regions)) missing(`${at}.regions`, a.regions, 'a list of regions (empty when none)');
    const names = new Set<string>();
    a.regions.forEach((r, k) => {
      const rat = `${at}.regions[${k}]`;
      if (!isObject(r) || typeof r.name !== 'string' || r.name === '') missing(rat, r, '{ name: a non-empty string, polygon, minArtSamples }');
      if (names.has(r.name)) refuse('COMPARE_INPUT_MISSING', `${rat}: region "${r.name}" is named twice; required each region once`);
      names.add(r.name);
      if (!Array.isArray(r.polygon) || r.polygon.length < 3 || !r.polygon.every((p) => Array.isArray(p) && p.length === 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]))) {
        missing(`${rat}.polygon`, r.polygon, 'at least three finite [x, y] points, part-local drawing px');
      }
      if (!Number.isInteger(r.minArtSamples) || r.minArtSamples < 1) missing(`${rat}.minArtSamples`, r.minArtSamples, 'a whole number >= 1 (P9)');
    });
  });
  const skins = new Set(input.attachments.map((a) => a.attachment.skin));
  if (skins.size > 1) {
    refuse('COMPARE_INPUT_MISSING', `attachments name ${skins.size} skins (${[...skins].map((s) => s ?? '(no skin)').join(', ')}); required one skin per call — each skin is posed as its own view, so compare each in its own call`);
  }
  validateFit('referenceArtFit', input.referenceArtFit);
  validateFit('candidateArtFit', input.candidateArtFit);
  const b = input.bounds;
  if (!isObject(b) || !isFiniteNumber(b.maxLocalDeformation) || b.maxLocalDeformation < 0) missing('bounds', b, '{ maxLocalDeformation: a finite world distance >= 0, maxStretch?, minStretch? }');
  if (b.maxStretch !== undefined && (!isFiniteNumber(b.maxStretch) || b.maxStretch < 0)) missing('bounds.maxStretch', b.maxStretch, 'a finite ratio >= 0, or the field left out');
  if (b.minStretch !== undefined && (!isFiniteNumber(b.minStretch) || b.minStretch < 0)) missing('bounds.minStretch', b.minStretch, 'a finite ratio >= 0, or the field left out');
  if (typeof input.motionRequired !== 'boolean') missing('motionRequired', input.motionRequired, 'true or false (P6)');
  if (typeof input.perFrame !== 'boolean') missing('perFrame', input.perFrame, 'true or false (P7)');
  if (plant !== 'amplitude-unvalidated') {
    // Issue #1291: the measurement's own validator, so a comparison and a measurement refuse one value in the same
    // words — under the comparison's code, and here, before any build is read.
    try {
      validateMotionAmplitude('the comparison', input.motionAmplitude);
    } catch (err) {
      if (err instanceof MeshReductionError) refuse('COMPARE_INPUT_MISSING', err.message.slice(err.code.length + 2));
      throw err;
    }
  }
  if (plant !== 'over-bound-unvalidated' && input.overBound !== undefined) {
    // Issue #1315: a request in full, or the field left out. No count is assumed and no table is chosen for the caller.
    const o: unknown = input.overBound;
    const shape = "an OverBoundRequest { maxSamples, triangles }, or the field left out — null asks for nothing, which is what leaving it out says";
    if (!isObject(o)) missing('overBound', o, shape);
    if (!Number.isInteger(o.maxSamples) || (o.maxSamples as number) < 1) missing('overBound.maxSamples', o.maxSamples, 'a whole number >= 1 — the most over-bound samples listed per row; there is no default');
    if (o.triangles !== 'over-bound' && o.triangles !== 'all') missing('overBound.triangles', o.triangles, "'over-bound' or 'all' — which triangles the per-triangle table lists; there is no default");
  }
  const s = input.schedule;
  if (s === null) return;
  if (!isObject(s)) missing('schedule', s, 'a MotionSchedule, or null for no motion');
  const physics = s.physics;
  if (!isObject(physics) || (physics.mode !== 'none' && physics.mode !== 'step')) missing('schedule.physics', physics, "{ mode: 'none' } or { mode: 'step', dt, warmupSteps: 0 }");
  if (physics.mode === 'step') {
    if (!isFiniteNumber(physics.dt) || physics.dt <= 0) missing('schedule.physics.dt', physics.dt, 'a finite step > 0, in seconds (P10)');
    const warmup: unknown = physics.warmupSteps;
    if (warmup !== 0) {
      refuse(
        'COMPARE_WARMUP_UNSUPPORTED',
        `schedule.physics.warmupSteps is ${JSON.stringify(warmup)}; required 0 — P10: no warm-up exists in the tree, so physics resets at time 0 and steps from there, and a nonzero warm-up is refused rather than run as zero`,
      );
    }
  }
  if (!Array.isArray(s.phases) || s.phases.length === 0 || !s.phases.every((p) => p === 'grid' || p === 'irr') || new Set(s.phases).size !== s.phases.length) {
    missing('schedule.phases', s.phases, "a non-empty list of distinct phases, each 'grid' or 'irr'");
  }
  if (!Array.isArray(s.frames)) missing('schedule.frames', s.frames, "a list of 'setup', { animation, times } and { animation, fps }");
  s.frames.forEach((f, i) => {
    const at = `schedule.frames[${i}]`;
    if (f === 'setup') return;
    if (!isObject(f) || typeof f.animation !== 'string' || f.animation === '') missing(at, f, "'setup', { animation, times: [...] } or { animation, fps }");
    if ('times' in f) {
      if (!Array.isArray(f.times) || f.times.length === 0 || !f.times.every((t) => isFiniteNumber(t) && t >= 0)) missing(`${at}.times`, f.times, 'a non-empty list of finite times >= 0, in seconds');
    } else if (!isFiniteNumber(f.fps) || f.fps <= 0) missing(`${at}.fps`, (f as { fps?: unknown }).fps, 'a finite rate > 0');
  });
  if (!Array.isArray(s.selection) || !s.selection.every((id) => typeof id === 'string')) missing('schedule.selection', s.selection, 'a list of frame ids (P11; empty when no frame chose a candidate)');
}

// ---------------------------------------------------------------------------
// correction 5 — every input not on the allowlist equal
// ---------------------------------------------------------------------------

/** One step of a path into a document: a key, or an array index with the element's `name` when it has one. */
type Step = { key: string } | { index: number; name: string | null; element: unknown };

function pathText(path: readonly Step[]): string {
  let out = '';
  for (const s of path) {
    if ('key' in s) out += out === '' ? s.key : `.${s.key}`;
    else out += s.name === null ? `[${s.index}]` : `[${JSON.stringify(s.name)}]`;
  }
  return out;
}

function shown(value: unknown): string {
  if (value === undefined) return 'nothing (the field is absent)';
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** The skin-table skin an attachment reference resolves through: its own, or the default skin under no skin. */
function tableSkin(ref: AttachmentRef): string {
  return ref.skin ?? CORE_DEFAULT_SKIN;
}

const keyOf = (s: Step | undefined): string | null => (s !== undefined && 'key' in s ? s.key : null);
const nameAt = (s: Step | undefined): string | null => (s !== undefined && 'index' in s ? s.name : null);

/**
 * The allowlist (correction 5, §3), as paths into the model document. Exactly:
 * (a) the compared attachments' `uvs`, `triangles`, `vertices` (positions and
 * bindings), `hull` and `edges`; (b) what follows from them by topology — a
 * deform key's run (every field but its `time` and `curve`), a `transform`
 * deform key's report (`deformTransforms`, every field but the key's identity
 * and time), the slot's `meshes` entry (every field but `slot` and
 * `attachments`), the bones the meshes bind (`meshBones`, and each physics
 * constraint's `drivesMesh`), and the slot's `rig.meshKinds`,
 * `rig.meshDeclaredBones` and `rig.meshSoftBones`; (c) atlas layout — `pages` —
 * which the comparison never reads, since it takes each mesh's region UVs from
 * the document's own attachment (the raw pose's `uvs`), so the conversion from
 * page UVs back to region UVs holds by construction; and the digest of the
 * Spine file written beside the document (`spine.sha256`), which changes with
 * every byte of the mesh. Nothing else may differ.
 */
function allowed(path: readonly Step[], compared: readonly AttachmentRef[]): boolean {
  const top = keyOf(path[0]);
  const slots = new Set(compared.map((r) => r.slot));
  const isCompared = (skin: string | null, slot: string | null, att: string | null): boolean => compared.some((r) => tableSkin(r) === skin && r.slot === slot && r.attachment === att);
  if (top === 'pages' || top === 'meshBones') return true;
  if (top === 'spine' && keyOf(path[1]) === 'sha256') return true;
  if (top === 'skins' && path.length >= 6 && keyOf(path[2]) === 'attachments') {
    return isCompared(nameAt(path[1]), keyOf(path[3]), keyOf(path[4])) && ['uvs', 'triangles', 'vertices', 'hull', 'edges'].includes(keyOf(path[5]) ?? '');
  }
  if (top === 'animations' && path.length >= 11 && keyOf(path[2]) === 'attachments' && keyOf(path[8]) === 'deform') {
    const field = keyOf(path[10]);
    return isCompared(nameAt(path[3]), nameAt(path[5]), nameAt(path[7])) && field !== null && field !== 'time' && field !== 'curve';
  }
  if (top === 'deformTransforms' && path.length >= 3) {
    const step = path[1];
    const e = 'index' in step ? step.element : undefined;
    if (!isObject(e)) return false;
    const field = keyOf(path[2]) ?? '';
    return isCompared(typeof e.skin === 'string' ? e.skin : null, typeof e.slot === 'string' ? e.slot : null, typeof e.attachment === 'string' ? e.attachment : null) && !['animation', 'skin', 'slot', 'attachment', 'time'].includes(field);
  }
  if (top === 'meshes' && path.length >= 3) {
    const step = path[1];
    const e = 'index' in step ? step.element : undefined;
    const field = keyOf(path[2]) ?? '';
    return isObject(e) && typeof e.slot === 'string' && slots.has(e.slot) && field !== 'slot' && field !== 'attachments';
  }
  if (top === 'physics' && keyOf(path[2]) === 'drivesMesh') return true;
  if (top === 'rig' && path.length >= 3 && ['meshKinds', 'meshDeclaredBones', 'meshSoftBones'].includes(keyOf(path[1]) ?? '')) return slots.has(keyOf(path[2]) ?? '');
  return false;
}

/** The first leaf at which two documents differ outside the allowlist, in the reference's key order; null when none does. */
function firstDifference(a: unknown, b: unknown, path: Step[], compared: readonly AttachmentRef[]): { path: string; reference: unknown; candidate: unknown } | null {
  if (path.length > 0 && allowed(path, compared)) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return { path: `${pathText(path)}.length`, reference: a.length, candidate: b.length };
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      const name = isObject(e) && typeof e.name === 'string' ? e.name : null;
      const d = firstDifference(e, b[i], [...path, { index: i, name, element: e }], compared);
      if (d !== null) return d;
    }
    return null;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...Object.keys(a), ...Object.keys(b).filter((k) => !(k in a))];
    for (const k of keys) {
      const d = firstDifference(a[k], b[k], [...path, { key: k }], compared);
      if (d !== null) return d;
    }
    return null;
  }
  if (Object.is(a, b) || (typeof a === 'number' && a === b)) return null;
  return { path: pathText(path), reference: a, candidate: b };
}

// ---------------------------------------------------------------------------
// the schedule — P10, P11
// ---------------------------------------------------------------------------

interface Walk {
  animation: string;
  phase: 'grid' | 'irr' | null;
  /** The deltas the raw walk takes after its reset pose. */
  deltas: number[];
}

interface Planned {
  ref: FrameRef;
  /** Index into the walks, or null for the setup pose. */
  walk: number | null;
  /** The pose of that walk the frame is (0 = the reset pose at time 0). */
  pose: number;
}

/** A time as a frame id names it: on the `r6` grid. */
const idTime = (t: number): number => r6(t);

/**
 * The frames and walks a schedule names, in walk order: `setup` first where
 * listed, then each entry's frames in the order given — a rate under each
 * phase in `phases` order, explicit times once. A rate walks
 * `count = round(duration × fps)` intervals (the render's count,
 * `sampleAnimation` in `src/render_shared.ts`): `grid` takes `count + 1`
 * samples at `sampleTime('grid', …)` — `i / fps` on a whole number of frames —
 * and `irr` takes `count` at `sampleTime('irr', …)`, each a frame interval's
 * `IRR_OFFSET` past its grid sample (`src/core/animation.ts`). Explicit times
 * have no phase: their id spells `explicit` where a phase would be.
 */
function planSchedule(schedule: MotionSchedule, doc: CompiledDocument, physicsConstraints: number): { frames: Planned[]; walks: Walk[]; walkSteps: number[] } {
  const selection = new Set(schedule.selection);
  const physics = schedule.physics;
  if (physics.mode === 'none' && physicsConstraints > 0) {
    refuse('COMPARE_INPUT_MISSING', `schedule.physics.mode is "none" and the reference declares ${physicsConstraints} physics constraint(s); required { mode: 'step', dt, warmupSteps: 0 } — P10: mode and dt are required whenever a physics constraint is active`);
  }
  const frames: Planned[] = [];
  const walks: Walk[] = [];
  const walkSteps: number[] = [];
  const ids = new Set<string>();
  const role = (id: string): FrameRef['role'] => (id === 'setup' ? 'baseline' : selection.has(id) ? 'selection' : 'held-out');
  const add = (ref: Omit<FrameRef, 'role'>, walk: number | null, pose: number): void => {
    if (ids.has(ref.id)) refuse('COMPARE_INPUT_MISSING', `schedule.frames names the frame "${ref.id}" twice; required every frame id once (P11: a frame is named by one stable id)`);
    ids.add(ref.id);
    frames.push({ ref: { ...ref, role: role(ref.id) }, walk, pose });
  };
  const walkTo = (animation: string, phase: 'grid' | 'irr' | null, targets: Array<{ time: number; index: number }>): void => {
    const sorted = [...new Set(targets.map((t) => t.time))].sort((a, b) => a - b);
    // Absolute step times from the reset at 0: the oracle's `stepSchedule` rule under physics, one jump per frame without.
    const absolute: number[] = [];
    const poseAt = new Map<number, number>();
    let now = 0;
    for (const t of sorted) {
      if (t > now) {
        if (physics.mode === 'step') {
          const from = now;
          for (let k = 1; from + k * physics.dt < t; k++) absolute.push(from + k * physics.dt);
        }
        absolute.push(t);
        now = t;
      }
      poseAt.set(t, t === 0 ? 0 : absolute.length);
    }
    const deltas = absolute.map((s, i) => s - (i === 0 ? 0 : absolute[i - 1]));
    const w = walks.length;
    walks.push({ animation, phase, deltas });
    walkSteps.push(deltas.length);
    for (const t of targets) {
      const time = idTime(t.time);
      add({ id: `${animation}@${phase ?? 'explicit'}@${time}`, animation, phase, time, index: t.index }, w, poseAt.get(t.time) ?? 0);
    }
  };
  schedule.frames.forEach((f, i) => {
    if (f === 'setup') {
      add({ id: 'setup', animation: null, phase: null, time: null, index: null }, null, 0);
      return;
    }
    const anim = doc.animations.find((a) => a.name === f.animation);
    if (anim === undefined) missing(`schedule.frames[${i}].animation`, f.animation, `one of the reference's animations [${doc.animations.map((a) => a.name).join(', ')}]`);
    const d = anim.timelines.duration;
    if ('times' in f) {
      const late = f.times.find((t) => t > d);
      if (late !== undefined) missing(`schedule.frames[${i}].times`, late, `a time at most the animation's duration ${d} — past it the track holds, and the id would name a time that was not posed`);
      walkTo(f.animation, null, f.times.map((time, index) => ({ time, index })));
      return;
    }
    const count = Math.round(d * f.fps);
    for (const phase of schedule.phases) {
      const n = phase === 'grid' ? count + 1 : count;
      const targets: Array<{ time: number; index: number }> = [];
      for (let k = 0; k < n; k++) targets.push({ time: sampleTime(phase, d, k, n), index: k });
      if (targets.length > 0) walkTo(f.animation, phase, targets);
    }
  });
  const unscheduled = schedule.selection.filter((id) => !ids.has(id));
  if (unscheduled.length > 0) {
    refuse('COMPARE_INPUT_MISSING', `schedule.selection names ${unscheduled.map((id) => `"${id}"`).join(', ')}, which the schedule does not walk; required every selection id to be a scheduled frame's id (P11: rigc invents no split, and a selection it cannot place would be read as held out)`);
  }
  return { frames, walks, walkSteps };
}

// ---------------------------------------------------------------------------
// posing — rigc's core, the same steps for every build
// ---------------------------------------------------------------------------

/** One build posed at every planned frame: the compared attachments' world vertices (null where the slot drew something else). */
interface Posed {
  setup: Array<number[] | null>;
  /** Per planned frame, per attachment. */
  frames: Array<Array<number[] | null>>;
  /** Each bone's setup world 2×2, by name. */
  setupBones: Map<string, [number, number, number, number]>;
}

function viewOf(doc: CompiledDocument, skin: string | null): CompiledDocument {
  return skin === null ? underNoSkin(doc) : underSkin(doc, skin);
}

/** The compared attachment's world vertices in one pose, or null when its slot shows something else or nothing. */
function drawnOf(pose: RawPose, ref: AttachmentRef): number[] | null {
  const shownRow = pose.shown.find((s) => s.slot === ref.slot);
  if (shownRow === undefined || shownRow.placeholder !== ref.attachment || shownRow.skin !== tableSkin(ref) || shownRow.geometry.kind !== 'mesh') return null;
  const row = pose.drawn.find((d) => d.slot === ref.slot);
  return row === undefined ? null : row.vertices;
}

/**
 * The walk every build of a comparison is posed on (issue #1389): `poseRawAnimationEach`, reset at the animation, the
 * physics clock moved by `physicsClockStep` of each step — the render's clock (`src/core/raw.ts`). A walk time that
 * ends on a whole number of a physics constraint's steps leaves zero time over in exact arithmetic and a few ulps
 * either side of zero in doubles, so with the step itself as the clock the constraint took one step too few or one
 * too many by rounding. Measured over the clock arithmetic on 300 durations as the core reads them (float32, as Spine
 * does: n/12 s to 20 s and tenths to 8 s): at 12 fps and `dt` 1/12, the rate `@rig-c/parts` walks, 11,248 of 44,486
 * grid updates sit on a tie against a 60 Hz constraint and the frame clock happens to resolve every one as exact
 * arithmetic does, while against 30, 24 and 50 Hz it mis-steps 3,274, 3,350 and 3,160 of them; at 4 fps and `dt` 1/60
 * it mis-steps 19,876 grid and 594 irr updates against 60 Hz. The render's clock mis-steps none of any, so no time
 * that is not a tie came within its lead of a whole step. `clock: 'frame'` is that walk, the step itself — `ComparePlant`
 * `'frame-physics-clock'` and `MQ178`'s planted red. With no physics constraint the clock is read by nothing, so every
 * pose is the same either way (`MQ179`); with one, the lead moves the shown lag weight by about `2⁻³⁰` of the time
 * walked even where no step moves: on `MQ179`'s spring at parts' rate and 60 Hz, one unit of a row's sixth decimal,
 * which can move the worst sample to a neighbour that nearly ties it.
 */
export function comparisonWalk(doc: CompiledDocument, animation: string, deltas: readonly number[], plant: TimelinePlant, visit: (pose: RawPose, index: number) => void, clock: 'render' | 'frame' = 'render'): void {
  poseRawAnimationEach(doc, animation, deltas, plant, 'animation', visit, clock === 'render' ? physicsClockStep : undefined);
}

/**
 * The walks `schedule` plans over the model document `model`, in walk order, each with the steps every build is posed
 * on — `planSchedule`'s, read for the `mesh-compare` suite's `MQ178`. Internal: merely exported, so not promised; it
 * reads the schedule without the input checks `compareMeshesInMotion` runs first.
 */
export function comparisonWalks(schedule: MotionSchedule, model: string): Array<{ animation: string; phase: 'grid' | 'irr' | null; deltas: number[] }> {
  const doc = readModel(model, 'the model document');
  return planSchedule(schedule, doc, doc.constraints.filter((c) => c.kind === 'physics').length).walks.map((w) => ({ animation: w.animation, phase: w.phase, deltas: [...w.deltas] }));
}

function poseBuild(doc: CompiledDocument, refs: readonly AttachmentRef[], frames: readonly Planned[], walks: readonly Walk[], clock: 'render' | 'frame'): Posed | { refused: string } {
  try {
    const view = viewOf(doc, refs[0].skin);
    const setupPose = poseRawSetup(view);
    const setup = refs.map((r) => drawnOf(setupPose, r));
    const setupBones = new Map(setupPose.bones.map((b): [string, [number, number, number, number]] => [b.name, [b.a, b.b, b.c, b.d]]));
    const out: Array<Array<number[] | null>> = frames.map(() => refs.map(() => null));
    frames.forEach((f, i) => {
      if (f.walk === null) out[i] = setup;
    });
    walks.forEach((w, wi) => {
      const wanted = new Map<number, number[]>();
      frames.forEach((f, i) => {
        if (f.walk !== wi) return;
        const list = wanted.get(f.pose) ?? [];
        list.push(i);
        wanted.set(f.pose, list);
      });
      comparisonWalk(
        view,
        w.animation,
        w.deltas,
        {},
        (pose, index) => {
          const at = wanted.get(index);
          if (at === undefined) return;
          const drawn = refs.map((r) => drawnOf(pose, r));
          for (const i of at) out[i] = drawn;
        },
        clock,
      );
    });
    return { setup, frames: out, setupBones };
  } catch (err) {
    if (err instanceof CoreInputError) return { refused: `rigc's core does not pose this build: ${err.message}` };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// §3 — the samples and their carriers
// ---------------------------------------------------------------------------

/** Promised on `rig-c/meshcompare` since issue #1230; defined in `src/meshcarriers.ts` since issue #1294, which the skinning residual shares. */
export { uvCarriers };

interface Sample {
  uv: [number, number];
  /** Part-local drawing px, y down — where a region's polygon is read. */
  px: [number, number];
  /** An art pixel of the mask grid, or a reference hull vertex. */
  pixel: [number, number] | null;
  vertex: number | null;
}

interface MeshOf {
  uvs: number[];
  triangles: number[];
  hull: number;
  weights: SourceMesh['weights'];
}

/** The point a carrier puts the sample at over one pose's world vertices. */
function carried(c: Carrier, world: readonly number[]): [number, number] {
  const [i0, i1, i2] = c.corners;
  const [l0, l1, l2] = c.bary;
  return [l0 * world[i0 * 2] + l1 * world[i1 * 2] + l2 * world[i2 * 2], l0 * world[i0 * 2 + 1] + l1 * world[i1 * 2 + 1] + l2 * world[i2 * 2 + 1]];
}

/** In or on a closed polygon: on an edge within `ON_BOUNDARY` px, else by an even-odd ray cast. */
function inClosedPolygon(p: readonly [number, number], poly: ReadonlyArray<readonly [number, number]>): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
    if (hypot2(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t) <= ON_BOUNDARY) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

interface Built {
  row: MeasureRow;
  required: boolean;
}

/** One frame's reading of one row: the frame (by plan index), its value and where it was taken. */
interface Reading {
  frame: number;
  value: number;
  at: WorstSample['at'];
}

function judged(value: number, bound: { op: '<=' | '>='; value: number }): 'pass' | 'fail' {
  return (bound.op === '<=' ? value <= bound.value : value >= bound.value) ? 'pass' : 'fail';
}

function extreme(readings: readonly Reading[], dir: 'max' | 'min'): Reading | null {
  let best: Reading | null = null;
  for (const r of readings) if (best === null || (dir === 'max' ? r.value > best.value : r.value < best.value)) best = r;
  return best;
}

interface RowPlan {
  code: string;
  attachment: AttachmentRef;
  region: string | null;
  unit: MeasureRow['unit'];
  dir: 'max' | 'min';
  bound: MeasureRow['bound'];
  /** Whether a value of 0 (max rows) has nothing worse to point at — distance and count rows. */
  zeroIsIdeal: boolean;
}

/**
 * A motion row from its per-frame readings: the worst over every frame (§4,
 * *Transition in time*: the worst over the phases), then the same taken per
 * phase and per role, each against the row's bound.
 */
function motionRow(plan: RowPlan, readings: readonly Reading[], frames: readonly Planned[], schedule: MotionSchedule, notDrawn: readonly string[], extra: Partial<MotionRowDetail>): Built {
  const object = { attachment: plan.attachment, region: plan.region };
  const reading = (group: readonly Reading[]): MotionReading => {
    const w = extreme(group, plan.dir);
    if (w === null) return { value: null, state: 'not-measurable', frame: null };
    const value = r6(w.value);
    return { value, state: plan.bound === null ? 'undeclared' : judged(value, plan.bound), frame: frames[w.frame].ref.id };
  };
  const phases: Array<'grid' | 'irr' | null> = [...schedule.phases];
  if (frames.some((f) => f.ref.phase === null)) phases.push(null);
  const byPhase = phases.map((phase) => ({ phase, ...reading(readings.filter((r) => frames[r.frame].ref.phase === phase)) }));
  const real = byPhase.filter((p) => p.phase !== null && p.value !== null);
  const passing = real.find((p) => p.state === 'pass');
  const failing = real.find((p) => p.state === 'fail');
  const phasesDisagree =
    passing !== undefined && failing !== undefined && passing.frame !== null && failing.frame !== null
      ? {
          pass: passing.frame,
          fail: failing.frame,
          sentence: `${plan.code} passes under phase ${passing.phase} (worst at ${passing.frame}) and fails under phase ${failing.phase} (worst at ${failing.frame}); the row is the worst over both`,
        }
      : null;
  const byRoleOf = (role: FrameRef['role']): MotionReading | null => {
    const group = readings.filter((r) => frames[r.frame].ref.role === role);
    return frames.some((f) => f.ref.role === role) ? reading(group) : null;
  };
  const detail: MotionRowDetail = {
    frames: { measured: readings.length, notDrawn: [...notDrawn] },
    byPhase,
    phasesDisagree,
    byRole: { baseline: byRoleOf('baseline'), selection: byRoleOf('selection'), heldOut: byRoleOf('held-out') },
    ...extra,
  };
  const w = extreme(readings, plan.dir);
  if (w === null) {
    return {
      row: { code: plan.code, object, state: 'not-measurable', value: null, bound: null, unit: plan.unit, worst: null, reason: `${nameOf(plan.attachment)}: no scheduled frame draws the attachment, so there is nothing to measure`, motion: detail },
      required: plan.bound !== null,
    };
  }
  const value = r6(w.value);
  const worst: WorstSample = plan.zeroIsIdeal && value === 0 ? { at: {} } : { at: w.at, frame: frames[w.frame].ref };
  return {
    row: { code: plan.code, object, state: plan.bound === null ? 'undeclared' : judged(value, plan.bound), value, bound: plan.bound, unit: plan.unit, worst, reason: null, motion: detail },
    required: plan.bound !== null,
  };
}

function unmeasured(plan: RowPlan, reason: string, extra: Partial<MeasureRow> = {}): Built {
  return {
    row: { code: plan.code, object: { attachment: plan.attachment, region: plan.region }, state: 'not-measurable', value: null, bound: null, unit: plan.unit, worst: null, reason, ...extra },
    required: plan.bound !== null,
  };
}

/** §2's section rule: `measured` is pass + fail; `fail` when a required row failed, `pass` only when every required row passed and one row did. */
function sectionOf(built: readonly Built[]): EvidenceSection {
  const summary = { pass: 0, fail: 0, undeclared: 0, refused: 0, notMeasurable: 0, measured: 0 };
  for (const { row } of built) {
    if (row.state === 'pass') summary.pass++;
    else if (row.state === 'fail') summary.fail++;
    else if (row.state === 'undeclared') summary.undeclared++;
    else if (row.state === 'refused') summary.refused++;
    else summary.notMeasurable++;
  }
  summary.measured = summary.pass + summary.fail;
  const required = built.filter((b) => b.required);
  let verdict: EvidenceSection['verdict'];
  if (required.some((b) => b.row.state === 'fail')) verdict = 'fail';
  else if (required.every((b) => b.row.state === 'pass') && summary.pass > 0) verdict = 'pass';
  else verdict = 'not-measured';
  return { rows: built.map((b) => b.row), summary, verdict };
}

/** Two sections joined — one per attachment, in skeleton order — under §2's section rule over their verdicts. */
function joinSections(sections: readonly EvidenceSection[]): EvidenceSection {
  const summary = { pass: 0, fail: 0, undeclared: 0, refused: 0, notMeasurable: 0, measured: 0 };
  for (const s of sections) for (const k of Object.keys(summary) as Array<keyof typeof summary>) summary[k] += s.summary[k];
  const verdict: EvidenceSection['verdict'] = sections.some((s) => s.verdict === 'fail') ? 'fail' : sections.every((s) => s.verdict === 'pass') ? 'pass' : 'not-measured';
  return { rows: sections.flatMap((s) => s.rows), summary, verdict };
}

const ROW_ORDER = (a: MeasureRow, b: MeasureRow): number => {
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const ra = a.object.region;
  const rb = b.object.region;
  if (ra === rb) return 0;
  if (ra === null) return -1;
  if (rb === null) return 1;
  return ra < rb ? -1 : 1;
};

// ---------------------------------------------------------------------------
// the operation
// ---------------------------------------------------------------------------

interface Build {
  id: string;
  doc: CompiledDocument;
  raw: unknown;
  meshes: MeshOf[];
}

function readBuild(b: BuiltCandidate, who: string, refs: readonly AttachmentRef[]): Build {
  let doc: CompiledDocument;
  try {
    doc = readModel(b.model, `${who} "${b.id}"`);
  } catch (err) {
    if (err instanceof CoreInputError) refuse('COMPARE_INPUT_MISSING', `${who} "${b.id}": the model document cannot be read — ${err.message}; required a skeleton.model.json as build writes it`);
    throw err;
  }
  const raw: unknown = JSON.parse(b.model);
  const meshes = refs.map((ref): MeshOf => {
    const skin = doc.skins.find((k) => k.name === tableSkin(ref));
    const record = skin?.attachments[ref.slot]?.[ref.attachment];
    const g = record?.geometry;
    if (g === undefined || g.kind !== 'mesh') {
      refuse('COMPARE_INPUT_MISSING', `${who} "${b.id}": attachment ${nameOf(ref)} is ${record === undefined ? 'not in the document' : `a ${record.kind}, not a mesh`}; required a mesh attachment under skin "${tableSkin(ref)}" (a linked mesh is compared through its source)`);
    }
    if (g.hull === undefined) refuse('COMPARE_INPUT_MISSING', `${who} "${b.id}": mesh ${nameOf(ref)} states no hull; required the hull the build derives`);
    const weights = g.vertices.weighted ? g.vertices.bindings.map((v) => v.map((e) => ({ bone: e.bone, weight: e.weight }))) : null;
    return { uvs: [...g.uvs], triangles: [...g.triangles], hull: g.hull, weights };
  });
  return { id: b.id, doc, raw, meshes };
}

/** The slots `rig.deformMayFold` names in a raw document — read off the document, refused by name when it does not state them. */
function foldingSlots(raw: unknown, who: string): Set<string> {
  const rig = isObject(raw) ? raw.rig : undefined;
  const list = isObject(rig) ? rig.deformMayFold : undefined;
  if (!Array.isArray(list) || !list.every((s) => typeof s === 'string')) missing(`${who}'s rig.deformMayFold`, list, 'the list of slot names the build records (src/rig.ts, invariants.deformMayFold)');
  return new Set(list as string[]);
}

type GeometryRead = { geometry: EvidenceSection | null; counts: MeshCounts | null };
type MotionRead = { section: EvidenceSection & { schedule: ScheduleUsed }; perFrame: NonNullable<CandidateReport['perFrame']>; overBound: OverBoundReport | null } | null;
interface PreparedMotionData {
  frames: Planned[];
  walks: Walk[];
  folding: Set<string>;
  scheduleUsed: ScheduleUsed;
  samplesOf: Array<{ samples: Sample[]; art: number }>;
  refCarriers: Array<Array<Carrier | null>>;
  posedRef: Posed | { refused: string };
}
interface PreparedState {
  reference: Build;
  refs: AttachmentRef[];
  order: number[];
  refGeometry: GeometryRead;
  motionData: PreparedMotionData | null;
  referenceMotion: MotionRead;
  digests: Record<string, string>;
}

const preparedReferences = new WeakMap<PreparedMotionReference, PreparedState>();

/** One digest per bound field, so a mismatch names the field instead of accepting a stale pose or mask. */
function boundDigests(input: MotionReferenceInput): Record<string, string> {
  // JSON.stringify maps -0 to 0, drops undefined object fields, and maps non-finite numbers to null. A bound
  // option's signed zero can survive validation and is echoed in a report, so these are not safe digest aliases.
  const exact = (value: unknown, visiting = new Set<object>()): unknown => {
    if (value === null) return ['null'];
    if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'undefined') return [typeof value, value ?? null];
    if (typeof value !== 'object') return [typeof value, String(value)];
    if (visiting.has(value)) throw new Error('cyclic bound input');
    visiting.add(value);
    const encoded = Array.isArray(value)
      ? ['array', Array.from({ length: value.length }, (_, i) => Object.prototype.hasOwnProperty.call(value, i) ? exact(value[i], visiting) : ['hole'])]
      : ['object', Object.keys(value).map((key) => [key, exact((value as Record<string, unknown>)[key], visiting)])];
    visiting.delete(value);
    return encoded;
  };
  const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(exact(value))).digest('hex');
  return {
    reference: digest(input.reference),
    schedule: digest(input.schedule),
    attachments: digest(input.attachments.map((a) => ({
      attachment: a.attachment,
      art: { threshold: a.art.threshold, frame: a.art.frame, mask: {
        width: a.art.mask.width,
        height: a.art.mask.height,
        alpha: createHash('sha256').update(a.art.mask.alpha).digest('hex'),
      } },
      finalThreshold: a.finalThreshold,
      minArtSamples: a.minArtSamples,
      regions: a.regions,
    }))),
    referenceArtFit: digest(input.referenceArtFit),
    candidateArtFit: digest(input.candidateArtFit),
    bounds: digest(input.bounds),
    motionRequired: digest(input.motionRequired),
    perFrame: digest(input.perFrame),
    motionAmplitude: digest({ present: Object.prototype.hasOwnProperty.call(input, 'motionAmplitude'), value: input.motionAmplitude }),
    overBound: digest({ present: Object.prototype.hasOwnProperty.call(input, 'overBound'), value: input.overBound }),
  };
}

/** Prepare the source once for sequential candidates on the same schedule and the same art. */
export function prepareMotionReference(input: MotionReferenceInput): PreparedMotionReference {
  if (!isObject(input)) missing('the prepared reference input', input, 'a MotionReferenceInput object');
  const ref: unknown = input.reference;
  let id = 'prepared-candidate';
  while (isObject(ref) && id === ref.id) id += '-';
  const model = isObject(ref) && typeof ref.model === 'string' ? ref.model : '';
  validateInput({ ...input, candidates: [{ id, model }] }, null);
  // No caller-owned array enters the cache: a later mutation is detected against this snapshot at use.
  let snapshot: MotionReferenceInput;
  try { snapshot = structuredClone(input); }
  catch (e) { refuse('COMPARE_INPUT_MISSING', `the prepared reference input cannot be copied (${(e as Error).message}); required cloneable model, schedule, art and options`); }
  let state: PreparedState | null = null;
  const asComparison: MotionComparisonInput = { ...snapshot, candidates: [{ id, model: snapshot.reference.model }] };
  compareMeshesInMotionWith(asComparison, null, undefined, (ready) => { state = ready; });
  if (state === null) throw new Error('prepareMotionReference: reference preparation produced no state');
  const ready: PreparedState = state;
  try { ready.digests = boundDigests(snapshot); }
  catch (e) { refuse('COMPARE_INPUT_MISSING', `the prepared reference input cannot be digested (${(e as Error).message}); required a complete mask and comparison options`); }
  const handle: PreparedMotionReference = Object.freeze({ kind: 'prepared-motion-reference/1' });
  preparedReferences.set(handle, ready);
  return handle;
}

/** Compare a candidate against the prepared source; every bound input must still have the prepared bytes. */
export function comparePreparedMotion(handle: PreparedMotionReference, input: MotionComparisonInput): MeshQualityReport {
  const ready = preparedReferences.get(handle);
  if (ready === undefined) refuse('COMPARE_PREPARED_HANDLE', 'the prepared reference handle was not made by prepareMotionReference; required its opaque handle');
  let now: Record<string, string>;
  try { now = boundDigests(input); }
  catch { refuse('COMPARE_PREPARED_MISMATCH', 'the bound input cannot be digested; required the reference, schedule, attachments and options used to prepare the handle'); }
  for (const [field, digest] of Object.entries(ready.digests)) {
    if (now[field] !== digest) refuse('COMPARE_PREPARED_MISMATCH', `${field} changed after prepareMotionReference; required the same reference, schedule, art and options for this handle`);
  }
  const report = compareMeshesInMotionWith(input, null, ready);
  if (report === null) throw new Error('comparePreparedMotion: comparison produced no report');
  return report;
}

/**
 * Compare one or more candidate builds with a reference build in motion — §3
 * and §4's motion rows — and measure each build's art fit at the setup pose
 * (§3, *Independent evidence* (a)), into one `mesh-quality-report/1` with
 * `operation: 'compare'`. Throws a `MeshReductionError` for an input it
 * refuses (`COMPARE_INPUT_MISSING`, `COMPARE_INPUTS_DIFFER`,
 * `COMPARE_WARMUP_UNSUPPORTED`, `COMPARE_UV_CARRIER_NOT_UNIQUE`,
 * `COMPARE_REFERENCE_FAILS` for a reference whose coverage, overshoot or
 * undercut at the setup pose fails `referenceArtFit`, and `measureMeshQuality`'s own codes for the art).
 */
export function compareMeshesInMotion(input: MotionComparisonInput): MeshQualityReport {
  const report = compareMeshesInMotionWith(input, null);
  if (report === null) throw new Error('compareMeshesInMotion: comparison produced no report');
  return report;
}

/**
 * `compareMeshesInMotion` with a fault planted in how it carries `motionAmplitude` (`ComparePlant`) — the
 * `mesh-compare` suite's negative controls. Internal: merely exported, so not promised (RELEASING.md *The import
 * surface*).
 */
export function compareMeshesInMotionPlanted(input: MotionComparisonInput, plant: ComparePlant): MeshQualityReport {
  const report = compareMeshesInMotionWith(input, plant);
  if (report === null) throw new Error('compareMeshesInMotionPlanted: comparison produced no report');
  return report;
}

function compareMeshesInMotionWith(input: MotionComparisonInput, plant: ComparePlant | null, prepared?: PreparedState, capture?: (state: PreparedState) => void): MeshQualityReport | null {
  validateInput(input, plant);
  const amplitude = input.motionAmplitude;
  // What the setup measurement is handed: the field as the caller set it — left out as left out, `null` as `null`.
  const handed: { motionAmplitude?: MotionAmplitude | null } =
    plant === 'amplitude-not-carried' || amplitude === undefined || (plant === 'null-read-as-left-out' && amplitude === null) ? {} : { motionAmplitude: amplitude };
  const refs = prepared?.refs ?? input.attachments.map((a) => a.attachment);
  const reference = prepared?.reference ?? readBuild(input.reference, 'reference', refs);
  const candidates = capture === undefined ? input.candidates.map((c, i) => readBuild(c, `candidates[${i}]`, refs)) : [];
  for (const c of candidates) {
    const d = firstDifference(reference.raw, c.raw, [], refs);
    if (d !== null) {
      refuse(
        'COMPARE_INPUTS_DIFFER',
        `candidate "${c.id}" differs from reference "${reference.id}" at ${d.path}: the reference has ${shown(d.reference)} and the candidate has ${shown(d.candidate)}; required every input outside the allowlist equal (correction 5) — the allowlist is the compared mesh's vertices, UVs, triangles, hull, edges and bindings, what follows from them by topology, and atlas layout`,
      );
    }
  }
  // The slots in skeleton order fix the order attachments are reported in (§2).
  const slotRank = new Map(reference.doc.slots.map((s, i) => [s.name, i]));
  const order = prepared?.order ?? input.attachments.map((_a, i) => i).sort((p, q) => (slotRank.get(refs[p].slot) ?? 0) - (slotRank.get(refs[q].slot) ?? 0) || (refs[p].attachment < refs[q].attachment ? -1 : refs[p].attachment > refs[q].attachment ? 1 : 0));
  for (const ref of refs) {
    if (!slotRank.has(ref.slot)) missing(`attachment ${nameOf(ref)}'s slot`, ref.slot, `one of the reference's slots [${[...slotRank.keys()].join(', ')}]`);
  }

  // --- the setup art fit, each build under its own bounds (§3 (a)) ----------------------------
  const geometryOf = (b: Build, fit: ArtFitBounds): GeometryRead => {
    const sections: EvidenceSection[] = [];
    const counts: MeshCounts[] = [];
    for (const i of order) {
      const a = input.attachments[i];
      const m = b.meshes[i];
      const frame = a.art.frame;
      const points: Array<[number, number]> = [];
      for (let k = 0; k + 1 < m.uvs.length; k += 2) points.push([m.uvs[k] * frame.width, m.uvs[k + 1] * frame.height]);
      const measured = measureMeshQuality({
        id: b.id,
        attachment: a.attachment,
        art: { mask: a.art.mask, threshold: a.finalThreshold, frame },
        source: { points, uvs: m.uvs, triangles: m.triangles, hull: m.hull, weights: m.weights },
        targets: { artFit: fit, maxBoundaryDeviation: null, regions: [] },
        referenceHull: null,
        minArtSamples: a.minArtSamples,
        regionArtSamples: [],
        protect: null,
        influences: null,
        boneOrder: null,
        preset: null,
        ...handed,
      });
      const c = measured.candidates[0];
      if (c.geometry === null || c.counts === null) return { geometry: null, counts: null };
      if (plant === 'amplitude-gates-acceptance') {
        const load = c.geometry.rows.find((r) => r.code === 'MQ_DEFORM_LOAD');
        if (load !== undefined && load.state === 'undeclared') c.geometry.verdict = 'fail';
      }
      sections.push(c.geometry);
      counts.push(c.counts);
    }
    const total: MeshCounts = {
      boundaryVertices: counts.reduce((s, c) => s + c.boundaryVertices, 0),
      interiorVertices: counts.reduce((s, c) => s + c.interiorVertices, 0),
      triangles: counts.reduce((s, c) => s + c.triangles, 0),
      bindings: counts.reduce((s, c) => s + c.bindings, 0),
      maxInfluences: counts.reduce((s, c) => Math.max(s, c.maxInfluences), 0),
    };
    return { geometry: joinSections(sections), counts: total };
  };
  const refGeometry = prepared?.refGeometry ?? geometryOf(reference, input.referenceArtFit);
  // §3 *Independent evidence* (a), P8: a reference that fails its own art fit — coverage, overshoot or undercut against
  // its own mask under `referenceArtFit` — is refused AS A REFERENCE: a deviation from a reference that does not carry
  // its own art is not evidence, so no candidate is measured against it. (a) is those three rows and no other: winding
  // is (b)'s (A39, the build's own gate), and a row the reference could not measure (an attachment under its sample
  // floor, P9) leaves its section not-measured and the reference not accepted, which the report already says.
  const artFitFailed = (refGeometry.geometry?.rows ?? []).filter((r) => r.state === 'fail' && REFERENCE_ART_FIT.includes(r.code));
  if (artFitFailed.length > 0) {
    refuse(
      'COMPARE_REFERENCE_FAILS',
      `reference "${reference.id}" fails its own art fit at the setup pose under referenceArtFit — ${artFitFailed
        .map((r) => `${r.code} of ${nameOf(r.object.attachment)}${r.object.region === null ? '' : ` region "${r.object.region}"`} is ${r.value}${r.bound === null ? '' : `, required ${r.bound.op} ${r.bound.value}`}`)
        .join('; ')}; required the reference's coverage, overshoot and undercut within referenceArtFit (P8 and §3, Independent evidence (a): a deviation from a reference that does not carry its own art is not evidence)`,
    );
  }
  const candGeometry = candidates.map((c) => geometryOf(c, input.candidateArtFit));

  // --- motion ---------------------------------------------------------------------------------
  const schedule = input.schedule;
  // Issue #1315: the request as the caller set it; `?? undefined` only matters under the unvalidated plant.
  const overBound: OverBoundRequest | undefined = input.overBound ?? undefined;
  let motionOf: (b: Build, isReference: boolean) => MotionRead = () => null;
  let motionData: PreparedMotionData | null = null;
  if (schedule !== null) {
    const existing = prepared?.motionData;
    const planned = existing === undefined ? planSchedule(schedule, reference.doc, reference.doc.constraints.filter((c) => c.kind === 'physics').length) : null;
    const frames = existing?.frames ?? planned!.frames;
    const walks = existing?.walks ?? planned!.walks;
    const folding = existing?.folding ?? foldingSlots(reference.raw, `reference "${reference.id}"`);
    const scheduleUsed: ScheduleUsed = existing?.scheduleUsed ?? {
      ...schedule,
      walked: frames.map((f) => f.ref),
      roles: (['baseline', 'selection', 'held-out'] as const).filter((r) => frames.some((f) => f.ref.role === r)),
      heldOutClaim: frames.some((f) => f.ref.role === 'held-out'),
      reset: 'physics reset at time 0',
      walks: walks.map((w, i) => ({ animation: w.animation, phase: w.phase, steps: planned!.walkSteps[i] })),
    };
    // The samples, per attachment: art pixel centres at the final threshold, then the reference hull's UVs (§3).
    const samplesOf = existing?.samplesOf ?? order.map((i) => {
      const a = input.attachments[i];
      const { mask, frame } = a.art;
      const bits = artOf(mask, a.finalThreshold);
      const out: Sample[] = [];
      for (let y = 0; y < mask.height; y++) {
        for (let x = 0; x < mask.width; x++) {
          if (!bits[y * mask.width + x]) continue;
          const uv: [number, number] = [(x + 0.5) / mask.width, (y + 0.5) / mask.height];
          out.push({ uv, px: [uv[0] * frame.width, uv[1] * frame.height], pixel: [x, y], vertex: null });
        }
      }
      const art = out.length;
      const m = reference.meshes[i];
      for (let v = 0; v < m.hull; v++) {
        const uv: [number, number] = [m.uvs[v * 2], m.uvs[v * 2 + 1]];
        out.push({ uv, px: [uv[0] * frame.width, uv[1] * frame.height], pixel: null, vertex: v });
      }
      return { samples: out, art };
    });
    const carrierPlant: CarrierPlant | null = plant === 'slack-support-unread' || plant === 'narrowest-slack' || plant === 'any-shared-vertex' ? plant : null;
    const carriersOf = (uvs: readonly number[], triangles: readonly number[], samples: ReadonlyArray<{ uv: [number, number] }>, who: string): Array<Carrier | null> =>
      uvCarriersWith(uvs, triangles, samples, who, carrierPlant);
    const refCarriers = existing?.refCarriers ?? order.map((i, k) => carriersOf(reference.meshes[i].uvs, reference.meshes[i].triangles, samplesOf[k].samples, `reference "${reference.id}", attachment ${nameOf(refs[i])}`));
    const clock = plant === 'frame-physics-clock' ? 'frame' : 'render';
    const posedRef = existing?.posedRef ?? poseBuild(reference.doc, order.map((i) => refs[i]), frames, walks, clock);
    motionData = { frames, walks, folding, scheduleUsed, samplesOf, refCarriers, posedRef };

    motionOf = (b: Build, isReference: boolean) => {
      const carriers = isReference ? refCarriers : order.map((i, k) => carriersOf(b.meshes[i].uvs, b.meshes[i].triangles, samplesOf[k].samples, `candidate "${b.id}", attachment ${nameOf(refs[i])}`));
      const posed = isReference ? posedRef : poseBuild(b.doc, order.map((i) => refs[i]), frames, walks, clock);
      const built: Built[] = [];
      const perFrame: NonNullable<CandidateReport['perFrame']> = [];
      // Issue #1315: kept for a candidate only, and only when asked — a call without the field does none of this.
      const ask = isReference ? undefined : overBound;
      const located: OverBoundReport | null = ask === undefined ? null : { selectionFrames: frames.filter((f) => f.ref.role === 'selection').length, rows: [], triangles: [] };
      order.forEach((i, k) => {
        const a = input.attachments[i];
        const ref = refs[i];
        const mesh = b.meshes[i];
        const plans = {
          local: { code: 'MQ_LOCAL_DEFORMATION', attachment: ref, region: null, unit: 'world', dir: 'max', bound: { op: '<=', value: input.bounds.maxLocalDeformation }, zeroIsIdeal: true } as RowPlan,
          stretch: { code: 'MQ_STRETCH', attachment: ref, region: null, unit: 'ratio', dir: 'max', bound: input.bounds.maxStretch === undefined ? null : { op: '<=', value: input.bounds.maxStretch }, zeroIsIdeal: false } as RowPlan,
          squash: { code: 'MQ_SQUASH', attachment: ref, region: null, unit: 'ratio', dir: 'min', bound: input.bounds.minStretch === undefined ? null : { op: '>=', value: input.bounds.minStretch }, zeroIsIdeal: false } as RowPlan,
          inversion: { code: 'MQ_INVERSION', attachment: ref, region: null, unit: 'count', dir: 'max', bound: folding.has(ref.slot) ? null : { op: '<=', value: 0 }, zeroIsIdeal: true } as RowPlan,
        };
        const regionPlans = a.regions.map((r): RowPlan => ({ ...plans.local, region: r.name }));
        const sampling = (region: string | null, count: number) => ({ domain: `art pixel centres at alpha >= ${a.finalThreshold} and the reference hull's UVs, on the region UV square${region === null ? '' : `, inside region "${region}"`}`, count });
        const { samples, art } = samplesOf[k];
        const inRegion = a.regions.map((r) => samples.map((s) => inClosedPolygon(s.px, r.polygon)));
        const artIn = (mask: readonly boolean[] | null): number => samples.reduce((n, s, j) => n + (s.pixel !== null && (mask === null || mask[j]) ? 1 : 0), 0);
        // P2: a build the core does not pose leaves every motion row not measurable, by its words — never approximated.
        if ('refused' in posed || 'refused' in posedRef) {
          const reason = 'refused' in posedRef ? `reference "${reference.id}": ${posedRef.refused}` : 'refused' in posed ? posed.refused : '';
          built.push(unmeasured(plans.local, reason, { art: { threshold: a.finalThreshold, connectivity: null, samples: art }, sampling: sampling(null, samples.length) }));
          for (const p of [plans.stretch, plans.squash, plans.inversion]) built.push(unmeasured(p, reason));
          regionPlans.forEach((p, r) => built.push(unmeasured(p, reason, { art: { threshold: a.finalThreshold, connectivity: null, samples: artIn(inRegion[r]) }, sampling: sampling(p.region, inRegion[r].filter(Boolean).length) })));
          return;
        }
        const refPosed = posedRef;
        const candCarrier = carriers[k];
        const refCarrier = refCarriers[k];
        const both = samples.map((_s, j) => refCarrier[j] !== null && candCarrier[j] !== null);
        const uncarried = {
          reference: samples.filter((_s, j) => refCarrier[j] === null).map((s) => s.uv),
          candidate: samples.filter((_s, j) => candCarrier[j] === null).map((s) => s.uv),
        };
        const notDrawn: string[] = [];
        const local: Reading[] = [];
        const localByRegion: Reading[][] = a.regions.map(() => []);
        const stretch: Reading[] = [];
        const squash: Reading[] = [];
        const inversion: Reading[] = [];
        const folds: Array<{ triangle: number; frame: string }> = [];
        // Issue #1315: each sample's worst distance over every frame and the frame of it (first in walk order); each
        // triangle's worst reading of each row over the selection frames. Bookkeeping over values computed below anyway.
        const nTri = mesh.triangles.length / 3;
        const track = located !== null;
        const sampleWorst = new Float64Array(track ? samples.length : 0).fill(-1);
        const sampleFrame = new Int32Array(track ? samples.length : 0).fill(-1);
        const triLocal = new Float64Array(track ? nTri : 0).fill(-1);
        const triHi = new Float64Array(track ? nTri : 0).fill(-Infinity);
        const triLo = new Float64Array(track ? nTri : 0).fill(Infinity);
        const triStretchRead = new Uint8Array(track ? nTri : 0);
        const triReversed = new Int32Array(track ? nTri : 0);
        const triInversionRead = new Uint8Array(track ? nTri : 0);
        const setupWorld = posed.setup[k];
        const setupAreas = setupWorld === null ? [] : triangleAreas(setupWorld, mesh.triangles);
        const setupBand = setupWorld === null ? 0 : areaBand(setupAreas, setupWorld);
        const degenerateAtSetup = setupAreas.filter((x) => Math.abs(x) <= setupBand).length;
        frames.forEach((f, fi) => {
          const cw = posed.frames[fi][k];
          const rw = refPosed.frames[fi][k];
          if (cw === null || rw === null) {
            notDrawn.push(f.ref.id);
            return;
          }
          const selected = track && (f.ref.role === 'selection' || plant === 'over-bound-table-every-frame');
          // Local deformation: the carried points, sample by sample.
          let worst = -1;
          let worstAt = -1;
          const regionWorst = a.regions.map(() => ({ d: -1, j: -1 }));
          for (let j = 0; j < samples.length; j++) {
            if (!both[j]) continue;
            const p = carried(refCarrier[j]!, rw);
            const q = carried(candCarrier[j]!, cw);
            const d = hypot2(q[0] - p[0], q[1] - p[1]);
            if (d > worst) {
              worst = d;
              worstAt = j;
            }
            if (track) {
              if (d > sampleWorst[j]) {
                sampleWorst[j] = d;
                sampleFrame[j] = fi;
              }
              if (selected) {
                const t = candCarrier[j]!.triangle;
                if (d > triLocal[t]) triLocal[t] = d;
              }
            }
            for (let r = 0; r < a.regions.length; r++) {
              if (inRegion[r][j] && d > regionWorst[r].d) regionWorst[r] = { d, j };
            }
          }
          const atOf = (j: number): WorstSample['at'] => {
            const s = samples[j];
            return s.pixel !== null ? { pixel: s.pixel, uv: s.uv } : { vertex: s.vertex ?? undefined, uv: s.uv };
          };
          if (worstAt >= 0) local.push({ frame: fi, value: worst, at: atOf(worstAt) });
          regionWorst.forEach((rw2, r) => {
            if (rw2.j >= 0) localByRegion[r].push({ frame: fi, value: rw2.d, at: atOf(rw2.j) });
          });
          // Stretch, squash and reversal: each triangle's map from its setup world triangle to this frame's, A39's band.
          if (setupWorld === null) return;
          const after = triangleAreas(cw, mesh.triangles);
          const band = areaBand(setupAreas, setupWorld, cw);
          let hi: Reading | null = null;
          let lo: Reading | null = null;
          let reversed = 0;
          let firstReversed = -1;
          for (let t = 0; t < setupAreas.length; t++) {
            if (Math.abs(setupAreas[t]) <= band) continue;
            const sv = stretchSingularValues(setupWorld, cw, mesh.triangles, t);
            if (sv !== null) {
              if (hi === null || sv.max > hi.value) hi = { frame: fi, value: sv.max, at: { triangle: t } };
              if (lo === null || sv.min < lo.value) lo = { frame: fi, value: sv.min, at: { triangle: t } };
              if (selected) {
                triStretchRead[t] = 1;
                if (sv.max > triHi[t]) triHi[t] = sv.max;
                if (sv.min < triLo[t]) triLo[t] = sv.min;
              }
            }
            if (selected) triInversionRead[t] = 1;
            if (Math.abs(after[t]) <= band) continue;
            if (Math.sign(setupAreas[t]) !== Math.sign(after[t])) {
              if (selected) triReversed[t]++;
              reversed++;
              if (firstReversed === -1) firstReversed = t;
              if (folding.has(ref.slot)) folds.push({ triangle: t, frame: f.ref.id });
            }
          }
          if (hi !== null) stretch.push(hi);
          if (lo !== null) squash.push(lo);
          inversion.push({ frame: fi, value: reversed, at: firstReversed === -1 ? {} : { triangle: firstReversed } });
        });
        // The declared setup map of the slot bone — correction 4's units, never a single ratio.
        const slotBone = b.doc.slots.find((s) => s.name === ref.slot)?.bone ?? '';
        const m2 = posed.setupBones.get(slotBone);
        const sv = m2 === undefined ? null : stretchSingularValues([0, 0, 1, 0, 0, 1], [0, 0, m2[0], m2[2], m2[1], m2[3]], [0, 1, 2], 0);
        const setupMap = m2 === undefined || sv === null ? undefined : { bone: slotBone, linear: m2.map(r6) as [number, number, number, number], singularScales: [r6(sv.max), r6(sv.min)] as [number, number] };
        const art_ = { threshold: a.finalThreshold, connectivity: null, samples: art };
        if (art < a.minArtSamples) {
          built.push(
            unmeasured(plans.local, `attachment ${nameOf(ref)} has ${art} art sample(s) at alpha >= ${a.finalThreshold}; required at least ${a.minArtSamples} (minArtSamples, P9) — the reference hull's UVs are samples and do not count towards it`, {
              art: art_,
              sampling: sampling(null, samples.length),
            }),
          );
        } else {
          const row = motionRow(plans.local, local, frames, schedule, notDrawn, { setupMap, uncarried });
          row.row.art = art_;
          row.row.sampling = sampling(null, samples.length);
          if (row.row.state === 'not-measurable' && notDrawn.length < frames.length) row.row.reason = `${nameOf(ref)}: no sample is carried by both the reference's and this build's UV triangles`;
          built.push(row);
        }
        regionPlans.forEach((p, r) => {
          const n = artIn(inRegion[r]);
          const regionArt = { threshold: a.finalThreshold, connectivity: null, samples: n };
          const floor = a.regions[r].minArtSamples;
          const samp = sampling(p.region, inRegion[r].filter(Boolean).length);
          if (n < floor) {
            built.push(unmeasured(p, `region "${p.region}" of ${nameOf(ref)} holds ${n} art sample(s) at alpha >= ${a.finalThreshold}; required at least ${floor} (its minArtSamples, P9) — hull samples do not count towards it`, { art: regionArt, sampling: samp }));
            return;
          }
          const row = motionRow(p, localByRegion[r], frames, schedule, notDrawn, { setupMap });
          row.row.art = regionArt;
          row.row.sampling = samp;
          built.push(row);
        });
        if (setupWorld === null) {
          // No setup shape to measure a map from: the slot shows something else, or nothing, at the setup pose.
          const why = `${nameOf(ref)}: the slot does not show the attachment at the setup pose, so no triangle has a setup shape to measure stretch or reversal from`;
          for (const p of [plans.stretch, plans.squash, plans.inversion]) built.push(unmeasured(p, why));
        } else {
          built.push(motionRow(plans.stretch, stretch, frames, schedule, notDrawn, { degenerateAtSetup }));
          built.push(motionRow(plans.squash, squash, frames, schedule, notDrawn, { degenerateAtSetup }));
          // A slot `deformMayFold` names: the row holds no bound (A39 exempts it), keeps its count rather than zeroing it, and lists every fold.
          built.push(motionRow(plans.inversion, inversion, frames, schedule, notDrawn, folding.has(ref.slot) ? { folds, degenerateAtSetup } : { degenerateAtSetup }));
        }
        if (located !== null && ask !== undefined) {
          // Issue #1315: the samples over the local-deformation bound, per measured row, and the per-triangle tables.
          const localBound = { op: '<=' as const, value: input.bounds.maxLocalDeformation };
          const listed = (region: string | null, inside: readonly boolean[] | null): OverBoundRow => {
            const over: Array<{ j: number; v: number }> = [];
            for (let j = 0; j < samples.length; j++) {
              if (sampleFrame[j] < 0 || (inside !== null && !inside[j])) continue;
              const v = r6(sampleWorst[j]);
              if (judged(v, localBound) === 'fail') over.push({ j, v });
            }
            if (plant !== 'over-bound-domain-order') over.sort((p, q) => q.v - p.v || p.j - q.j);
            const kept = over.slice(0, ask.maxSamples);
            return {
              code: 'MQ_LOCAL_DEFORMATION',
              attachment: ref,
              region,
              bound: localBound,
              total: plant === 'over-bound-total-is-listed' ? kept.length : over.length,
              samples: kept.map(({ j, v }) => {
                const s = samples[j];
                const c = plant === 'over-bound-reference-carrier' ? refCarrier[j]! : candCarrier[j]!;
                return {
                  at: s.pixel !== null ? { pixel: s.pixel, uv: s.uv } : { vertex: s.vertex ?? -1, uv: s.uv },
                  frame: frames[sampleFrame[j]].ref,
                  value: v,
                  triangle: c.triangle,
                  corners: [c.corners[0], c.corners[1], c.corners[2]],
                };
              }),
            };
          };
          if (art >= a.minArtSamples) located.rows.push(listed(null, null));
          const measuredRegions = a.regions
            .map((r, ri) => ({ name: r.name, ri }))
            .filter(({ ri }) => artIn(inRegion[ri]) >= a.regions[ri].minArtSamples)
            .sort((p, q) => (p.name < q.name ? -1 : p.name > q.name ? 1 : 0));
          for (const { name, ri } of measuredRegions) located.rows.push(listed(name, inRegion[ri]));
          const table = (code: string, bound: { op: '<=' | '>='; value: number }, read: (t: number) => number | null): TriangleMaxima => {
            const values: Array<{ triangle: number; value: number }> = [];
            for (let t = 0; t < nTri; t++) {
              const raw = read(t);
              if (raw === null) continue;
              const value = r6(raw);
              if (ask.triangles === 'all' || judged(value, bound) === 'fail') values.push({ triangle: t, value });
            }
            values.sort((p, q) => (bound.op === '<=' ? q.value - p.value : p.value - q.value) || p.triangle - q.triangle);
            return { code, attachment: ref, bound, values };
          };
          // Codes in the rows' order (ROW_ORDER: codes as strings); a row with no declared bound has no table.
          if (setupWorld !== null && plans.inversion.bound !== null) located.triangles.push(table('MQ_INVERSION', plans.inversion.bound, (t) => (triInversionRead[t] === 1 ? triReversed[t] : null)));
          if (art >= a.minArtSamples) located.triangles.push(table('MQ_LOCAL_DEFORMATION', localBound, (t) => (triLocal[t] >= 0 ? triLocal[t] : null)));
          if (setupWorld !== null && plans.squash.bound !== null) located.triangles.push(table('MQ_SQUASH', plans.squash.bound, (t) => (triStretchRead[t] === 1 ? triLo[t] : null)));
          if (setupWorld !== null && plans.stretch.bound !== null) located.triangles.push(table('MQ_STRETCH', plans.stretch.bound, (t) => (triStretchRead[t] === 1 ? triHi[t] : null)));
        }
        // P7's opt-in table: each attachment-level row's value at every frame walked, null where none was taken.
        const label = (code: string): string => (order.length > 1 ? `${code}[${nameOf(ref)}]` : code);
        const table: Array<[string, Reading[]]> = [
          ['MQ_INVERSION', inversion],
          ['MQ_LOCAL_DEFORMATION', art < a.minArtSamples ? [] : local],
          ['MQ_SQUASH', squash],
          ['MQ_STRETCH', stretch],
        ];
        for (const [code, readings] of table) {
          const at = new Map(readings.map((r) => [r.frame, r.value]));
          frames.forEach((f, fi) => {
            const v = at.get(fi);
            perFrame.push({ code: label(code), frame: f.ref.id, value: v === undefined ? null : r6(v) });
          });
        }
      });
      // Rows by attachment in skeleton order (built so), then code, then region.
      const grouped: Built[] = [];
      for (let k = 0; k < order.length; k++) {
        const ref = refs[order[k]];
        grouped.push(...built.filter((x) => x.row.object.attachment === ref).sort((p, q) => ROW_ORDER(p.row, q.row)));
      }
      return { section: { ...sectionOf(grouped), schedule: scheduleUsed }, perFrame, overBound: located };
    };
  }
  const referenceMotion = prepared?.referenceMotion ?? motionOf(reference, true);
  if (capture !== undefined) {
    capture({ reference, refs, order, refGeometry, motionData, referenceMotion, digests: {} });
    return null;
  }
  const candidateMotions = candidates.map((c) => motionOf(c, false));
  const reportOf = (b: Build, geometry: GeometryRead, measured: MotionRead, isCandidate: boolean): CandidateReport => {
    const motion = measured === null ? null : measured.section;
    // P6: the geometry verdict pass (every required row measured and passing), and — when motion is required — the motion verdict pass.
    const accepted = geometry.geometry !== null && geometry.geometry.verdict === 'pass' && (!input.motionRequired || (motion !== null && motion.verdict === 'pass'));
    const out: CandidateReport = { id: b.id, counts: geometry.counts, geometry: geometry.geometry, motion, accepted };
    if (input.perFrame && measured !== null) out.perFrame = measured.perFrame;
    if (isCandidate && overBound !== undefined) out.overBound = measured === null ? null : measured.overBound;
    return out;
  };
  const effective: EffectiveSettings = {
    preset: null,
    attachments: order.map((i) => {
      const a = input.attachments[i];
      return {
        attachment: a.attachment,
        threshold: a.art.threshold,
        finalThreshold: a.finalThreshold,
        frame: a.art.frame,
        maskSize: [a.art.mask.width, a.art.mask.height] as [number, number],
        minArtSamples: a.minArtSamples,
        regions: a.regions.map((r) => ({ name: r.name, minArtSamples: r.minArtSamples, polygon: r.polygon })),
      };
    }),
    sourceBounds: null,
    referenceArtFit: input.referenceArtFit,
    candidateArtFit: input.candidateArtFit,
    targets: null,
    referenceHull: null,
    motionBounds: input.bounds,
    protect: null,
    influences: null,
    boneOrder: null,
    schedule,
    budget: null,
    ...(amplitude === undefined ? (plant === 'echo-when-unset' ? { motionAmplitude: null } : {}) : { motionAmplitude: amplitude }),
    ...(overBound === undefined
      ? plant === 'over-bound-echo-when-unset'
        ? { overBound: { maxSamples: 1, triangles: 'over-bound' as const } }
        : {}
      : { overBound: { maxSamples: overBound.maxSamples, triangles: overBound.triangles } }),
  };
  const report: MeshQualityReport = {
    spec: MESH_QUALITY_REPORT_SPEC,
    operation: 'compare',
    effective,
    poser: schedule === null ? null : { kind: 'core', rigcVersion: readVersion() },
    motionRequired: input.motionRequired,
    sourceCounts: refGeometry.counts,
    reference: reportOf(reference, refGeometry, referenceMotion, false),
    candidates: candidates.map((c, i) => reportOf(c, candGeometry[i], candidateMotions[i], true)),
    termination: null,
  };
  // The prepared geometry, pose and reference rows live across calls. A caller may edit a returned report.
  return prepared === undefined ? report : structuredClone(report);
}
