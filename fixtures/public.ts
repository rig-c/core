/**
 * The selftest's own fixtures — synthetic, public, and written fresh every run.
 *
 * ⭐ Why this file exists. The suite in [`selftest.ts`](../selftest.ts) proves the
 * validator can go RED, and a break has to be aimed at something real to be a
 * break at all: a mutant names an attachment, a bone, an animation. For as long
 * as those names belonged to one private project's art, the gate this repository
 * ships was a gate a fresh clone could not run — the tool's central claim,
 * demonstrable only by the one person who already had the fixtures.
 *
 * So the fixtures are generated. Seven of them, and between them they carry every
 * structure the assertions have an opinion about:
 *
 *   - `overlay_probe`    — a base plate with alpha overlays pinned on top, one of
 *                          them a deformable ring mesh on a control bone, plus a
 *                          physics constraint and four animations. Region
 *                          attachments, attachment swaps, rgba fades, curves.
 *   - `articulated_probe` — a bone tree with an AXIS bone whose subtree travels
 *                          along it, a detached emitter, a ribbon mesh on a bone
 *                          chain, a second ring mesh, an occluder that must be
 *                          drawn after the part it hides, and a measured contact
 *                          ceiling.
 *   - `contained_probe`  — the SAME rig against a second manifest: no contact
 *                          ceiling, a containment ceiling instead, and a slot
 *                          whose manifest name differs from its rig name. It is a
 *                          separate fixture for the same reason its private
 *                          ancestor was: a ceiling that only one cut declares
 *                          makes its assertion vacuous on every other one, and a
 *                          break there would be caught by nothing.
 *   - `segments_probe`   — the one with NO manifest: a rig spec whose only mesh is
 *                          a `segments` generator over a plate of two islands,
 *                          under two bone chains, so the island join and the
 *                          distance weighting both run on every build of it.
 *   - `skirt_probe`      — also with no manifest: one plate under six chains of
 *                          five links, every link on a physics constraint, the
 *                          mesh weighted by an `influence` block (issue #1415),
 *                          and a hip sway for the physics to answer.
 *   - `pass_through_probe` — a skirt region swung through a leg region it is
 *                          drawn over, with a second copy of the leg drawn over
 *                          it, a draw-order key and a squashed hip — what
 *                          `render --pass-through` is held to (issue #1413).
 *   - `leg_stop_probe`   — a skirt chain swung into a leg three ways: held by a
 *                          `stops` declaration, held by the same network written
 *                          by hand, and not held (issue #1413).
 *
 * 🚫 **None of this is art.** Every plate is a checkerboard with its own name
 * burned into it by `tools/plate.ts`, and no claim about seams, blending or style
 * can be made from any of them. They exist to be structurally real — a PNG with a
 * true size and a true alpha channel, in the place the manifest says it is — so
 * that the compiler measures something and the atlas points somewhere.
 *
 * The numbers are chosen, not measured, and two of them are load-bearing:
 * `contact_depth` and `cap_containment_ceiling` sit a known distance above the
 * deepest key their motion spec asks for, so that the mutants which drive past
 * them can state the SMALLEST whole-pixel edit that crosses the line. A fixture
 * that cleared its ceiling by a mile would let a mutant pass while proving
 * nothing about where the boundary is.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Plate, type RGBA } from '../tools/plate.ts';

/** Everything `compile()` needs, plus where the fixture put itself. */
export interface Fixture {
  /** The rig spec's `name`, which is also what the validator reports. */
  rig: string;
  dir: string;
  rigPath: string;
  motionPath: string;
  manifestPath: string;
  outDir: string;
}

const INK: RGBA = [24, 28, 36, 255];
const PAPER: RGBA = [206, 212, 226, 255];
const ACCENT: RGBA = [198, 96, 72, 255];

/**
 * A checkerboard plate with its name across it.
 *
 * The checker is not decoration: a flat fill would make a wrong UV mapping
 * invisible, and half the point of a fixture is that a defect in the geometry
 * has somewhere to show up. `PLACEHOLDER` is burned in for the same reason it is
 * in every other synthetic plate in this project — so that no image from here can
 * ever be mistaken for a rendered part.
 */
export function writePlate(path: string, width: number, height: number, label: string, opaque = false): void {
  const plate = new Plate(width, height);
  const cell = 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      plate.set(x, y, on ? PAPER : INK);
    }
  }
  plate.frame(0, 0, width, height, 1, ACCENT);
  if (height >= 20) plate.textCentred(label.toUpperCase().slice(0, 18), width / 2, Math.max(2, height / 2 - 10), 1, ACCENT);
  if (height >= 34) plate.textCentred('PLACEHOLDER', width / 2, Math.max(12, height / 2 + 2), 1, ACCENT);
  if (!opaque) {
    // A transparent margin, so an overlay part is genuinely an overlay: it has
    // to carry alpha or A19 is measuring a rectangle that would paint over the
    // base plate it is supposed to sit on.
    plate.maskAlpha((x, y) => (x < 2 || y < 2 || x >= width - 2 || y >= height - 2 ? 0 : 255));
  }
  plate.writePng(path);
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** A convex-ish octagon inscribed in a window, in CROP pixels, y down. */
function octagon(x: number, y: number, w: number, h: number, inset: number): Array<[number, number]> {
  const l = x + inset;
  const r = x + w - inset;
  const t = y + inset;
  const b = y + h - inset;
  const mx = x + w / 2;
  const my = y + h / 2;
  const dx = (r - l) / 4;
  const dy = (b - t) / 4;
  return [
    [mx - dx, t],
    [mx + dx, t],
    [r, my - dy],
    [r, my + dy],
    [mx + dx, b],
    [mx - dx, b],
    [l, my + dy],
    [l, my - dy],
  ];
}

let root: string | null = null;
let parent: string | null = null;

/**
 * Make the fixture root inside `dir` rather than in the system temp directory
 * — the selftest's run root (issue #1137), which the selftest removes when it
 * exits, so the fixtures leave nothing behind. Named before the first fixture
 * is made, or refused: a root already made elsewhere would be left behind.
 */
export function placeFixturesUnder(dir: string): void {
  if (root !== null) throw new Error(`placeFixturesUnder(${dir}): the fixture root ${root} is already made`);
  parent = dir;
}

/** One temp root for the whole run, so a failed run leaves one directory to read. */
function fixtureRoot(): string {
  if (root === null) root = mkdtempSync(join(parent ?? tmpdir(), 'rigc-fixtures-'));
  return root;
}

function makeDir(name: string): string {
  const dir = join(fixtureRoot(), name);
  mkdirSync(join(dir, 'plates'), { recursive: true });
  mkdirSync(join(dir, 'parts'), { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// overlay_probe
// ---------------------------------------------------------------------------

/**
 * A base plate with three overlay slots pinned on top by manifest offsets, one of
 * them promoted to a ring mesh.
 *
 * The shape it stands in for is the commonest one there is: an untouched frame
 * plus small regenerated patches that have to composite back onto it without a
 * findable seam. Everything the overlay assertions look at is here — a slot that
 * fades with an rgba timeline, a slot that swaps attachments, a mesh whose rim is
 * pinned and whose interior is driven by a control bone, and an `idle` that is
 * allowed to key none of it.
 */
export function overlayFixture(): Fixture {
  const dir = makeDir('overlay_probe');
  const crop = 256;

  writePlate(join(dir, 'plates', '00_stage.png'), crop, crop, 'stage', true);
  writePlate(join(dir, 'parts', 'lens_l_shut.png'), 64, 40, 'lens l');
  writePlate(join(dir, 'parts', 'lens_r_shut.png'), 64, 40, 'lens r');
  writePlate(join(dir, 'parts', 'iris_open.png'), 96, 64, 'iris open');
  writePlate(join(dir, 'parts', 'iris_wide.png'), 96, 64, 'iris wide');
  // A numbered image series: four frames one attachment steps through, named
  // the way `Sequence.getPath` asks for them — the stem, then the frame number
  // zero-padded to four digits. The stem sorts after every manifest part in
  // `parts/`, because `CLI87` corrupts the FIRST part there and measures the
  // manifest's `image "parts/…"` refusal — a frame sorting first would answer it
  // with the frame's sentence instead.
  for (let frame = 1; frame <= 4; frame++) {
    writePlate(join(dir, 'parts', `spark_${String(frame).padStart(4, '0')}.png`), 32, 32, `spark ${frame}`);
  }

  const irisWindow = { x: 80, y: 150, w: 96, h: 64 };
  const manifestPath = join(dir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'rigc-fixture/overlay/1',
    note: 'Synthetic. Every plate is a generated checkerboard; no seam or style claim can come from this cut.',
    crop: { x: 0, y: 0, w: crop, h: crop, resample: 'none' },
    base: 'plates/00_stage.png',
    state_machine: { lens: ['open', 'shut'], iris: ['closed', 'open', 'wide'] },
    parts: [
      { slot: 'stage', draw_order: 0, image: 'plates/00_stage.png', offset: [0, 0] },
      {
        slot: 'lens_l',
        draw_order: 10,
        state_key: 'lens',
        offset: [40, 60],
        size: [64, 40],
        states: { open: null, shut: 'parts/lens_l_shut.png' },
      },
      {
        slot: 'lens_r',
        draw_order: 11,
        state_key: 'lens',
        offset: [150, 60],
        size: [64, 40],
        states: { open: null, shut: 'parts/lens_r_shut.png' },
      },
      {
        slot: 'iris',
        draw_order: 20,
        state_key: 'iris',
        offset: [irisWindow.x, irisWindow.y],
        size: [irisWindow.w, irisWindow.h],
        polygon: octagon(irisWindow.x, irisWindow.y, irisWindow.w, irisWindow.h, 14),
        states: { closed: null, open: 'parts/iris_open.png', wide: 'parts/iris_wide.png' },
        mesh: {
          kind: 'ring',
          hull: 'polygon',
          center: [irisWindow.x + irisWindow.w / 2, irisWindow.y + irisWindow.h / 2],
          inner: 0.45,
          control_bone: 'iris_aperture',
          bias: { axis_deg: 0, ramp: [4, 16] },
        },
      },
    ],
  });

  const rigPath = join(dir, 'overlay_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'overlay_probe',
    note: 'Synthetic fixture for the selftest. A handle bone re-seats the whole formation; every other bone sits at its part window centre, and `iris_aperture` is the mesh control bone the manifest names.',
    invariants: { meshSlots: 3, meshTriangles: 80 },
    // Where the rig's OWN skin finds its art — the numbered series below, which
    // no manifest part can state, in the directory the manifest's parts are in.
    images: 'parts',
    bones: [
      { name: 'root' },
      { name: 'panel', parent: 'root', x: 0, y: 0 },
      { name: 'stage', parent: 'panel', from: { slotWindow: 'stage' } },
      { name: 'lens_l', parent: 'panel', from: { slotWindow: 'lens_l' } },
      { name: 'lens_r', parent: 'panel', from: { slotWindow: 'lens_r' } },
      { name: 'iris', parent: 'panel', from: { slotWindow: 'iris' } },
      { name: 'iris_aperture', parent: 'iris', from: { meshCenter: 'iris' } },
    ],
    slots: [
      { name: 'stage', bone: 'stage' },
      { name: 'lens_l', bone: 'lens_l' },
      { name: 'lens_r', bone: 'lens_r' },
      { name: 'iris', bone: 'iris' },
      { name: 'spark', bone: 'panel' },
    ],
    // ⭐ The one slot the RIG fills rather than the manifest, because a
    // `sequence` is a rig-spec construct: a region whose frames are the four
    // `spark_0001`…`spark_0004` plates, stepped by `cycle` below. It is here
    // rather than on a probe of its own so the whole mutant table runs over a
    // skeleton that carries one (issue #729).
    skins: {
      default: { spark: { spark: { path: 'spark_', x: 40, y: 40, sequence: { count: 4, start: 1, digits: 4 } } } },
    },
  });

  const fade = (t: number, a: number, ease?: string): Record<string, unknown> => ({
    t,
    v: [1, 1, 1, a],
    ...(ease ? { ease } : {}),
  });
  const motionPath = join(dir, 'overlay_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'overlay_probe',
    cut: 'overlay_probe',
    easings: { soft: [0.25, 0, 0.75, 1] },
    groups: { lenses: ['lens_l', 'lens_r'] },
    setup: {
      stage: { attachment: '00_stage' },
      lens_l: { attachment: 'lens_l_shut', color: [1, 1, 1, 0] },
      lens_r: { attachment: 'lens_r_shut', color: [1, 1, 1, 0] },
      iris: { attachment: null },
      spark: { attachment: 'spark' },
    },
    physics: {
      iris_settle: {
        bone: 'iris_aperture',
        x: 0.6,
        y: 0.6,
        inertia: 0.6,
        strength: 100,
        damping: 0.85,
        mass: 1,
        mix: 1,
      },
    },
    animations: {
      // `idle` keys nothing that drives a mesh: that is A15's whole subject, and
      // a fixture whose idle broke the rule could never show the rule holding.
      idle: {
        duration: 2,
        loop: true,
        tracks: [{ slot: 'stage', property: 'rgba', keys: [fade(0, 1), fade(2, 1)] }],
      },
      shut_once: {
        duration: 0.4,
        loop: false,
        tracks: [{ group: 'lenses', property: 'rgba', keys: [fade(0, 0, 'soft'), fade(0.2, 1, 'soft'), fade(0.4, 0)] }],
      },
      shut_auto: {
        duration: 3,
        loop: true,
        tracks: [{ group: 'lenses', property: 'rgba', keys: [fade(0, 0), fade(1.4, 1), fade(1.6, 0), fade(3, 0)] }],
      },
      cycle: {
        duration: 1,
        loop: true,
        tracks: [
          {
            slot: 'iris',
            property: 'attachment',
            keys: [
              { t: 0, v: 'iris_open' },
              { t: 0.5, v: 'iris_wide' },
              { t: 1, v: 'iris_open' },
            ],
          },
        ],
        // The series, looped and then bounced: two modes whose frames differ
        // from the second pass on, so a `pingpong` played as a `loop` shows.
        sequence: [
          {
            slot: 'spark',
            attachment: 'spark',
            keys: [
              { t: 0, mode: 'loop', delay: 0.1 },
              { t: 0.5, mode: 'pingpong', index: 1, delay: 0.1 },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'overlay_probe', dir, rigPath, motionPath, manifestPath, outDir: join(dir, 'spine') };
}

// ---------------------------------------------------------------------------
// articulated_probe — the rig both remaining fixtures compile against
// ---------------------------------------------------------------------------

const ARTICULATED_ANCHORS: Record<string, number[]> = {
  cam: [240, 135],
  stage: [240, 135],
  mass: [233, 175],
  mass_a: [212, 169, 195],
  mass_b: [255, 180, 15],
  axis: [158, 110],
  plunger: [230, 130],
  plunger_tip: [155, 110],
  rim: [158, 110],
  rim_grip_a: [168, 121, 45],
  rim_grip_b: [147, 121, 135],
  rim_grip_c: [147, 100, 225],
  rim_grip_d: [168, 100, 315],
  emitter: [158, 110],
  trail_a: [158, 132],
  trail_b: [158, 154],
  trail_c: [158, 176],
};

/** Screen degrees, y down. The compiler negates it into Spine's y-up CCW. */
const ARTICULATED_AXIS = { deg: 195, unit: [-0.9659, -0.2588] };

/**
 * The bone tree and slot table both articulated fixtures share.
 *
 * ⭐ The axis bone is the point of the whole formation. Its setup rotation
 * carries the direction of travel, so everything under it moves with a
 * translateX and one number re-aims the entire animation at a cut framed from
 * somewhere else. `invariants` is where that fact — and the forbidden parentage,
 * and the bone the mass hangs on — is written down, because the emitted skeleton
 * has nowhere to say any of it.
 */
function writeArticulatedRig(dir: string): string {
  const rigPath = join(dir, 'articulated_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'articulated_probe',
    note: 'Synthetic fixture for the selftest. Nothing here is cut-specific: every position comes from the manifest anchors and the direction of travel from its axis angle, which is what lets one rig serve both articulated fixtures.',
    invariants: {
      meshSlots: 3,
      meshTriangles: 80,
      axisBone: 'axis',
      massBone: 'mass',
      detached: [
        {
          bone: 'emitter',
          notUnder: 'plunger',
          why: 'what the emitter releases stays where it was released and takes gravity; parented to the moving part it would be dragged along with every stroke',
        },
      ],
    },
    bones: [
      { name: 'root' },
      { name: 'cam', parent: 'root', from: { anchor: 'cam' } },
      { name: 'stage', parent: 'cam', from: { anchor: 'stage' } },
      { name: 'mass', parent: 'cam', from: { anchor: 'mass' } },
      { name: 'mass_a', parent: 'mass', from: { anchor: 'mass_a', rotation: 'anchor' } },
      { name: 'mass_b', parent: 'mass', from: { anchor: 'mass_b', rotation: 'anchor' } },
      // `color`/`icon` are editor affordances with no rendering effect; they ride
      // here so the round trip sees them copied through rather than dropped.
      { name: 'axis', parent: 'cam', from: { anchor: 'axis', rotation: 'axis' }, color: 'ff3f00ff', icon: 'arrowsB' },
      { name: 'plunger', parent: 'axis', from: { anchor: 'plunger' } },
      { name: 'plunger_tip', parent: 'plunger', from: { anchor: 'plunger_tip' } },
      { name: 'rim', parent: 'axis', from: { anchor: 'rim' } },
      { name: 'rim_grip_a', parent: 'rim', from: { anchor: 'rim_grip_a', rotation: 'anchor' } },
      { name: 'rim_grip_b', parent: 'rim', from: { anchor: 'rim_grip_b', rotation: 'anchor' } },
      { name: 'rim_grip_c', parent: 'rim', from: { anchor: 'rim_grip_c', rotation: 'anchor' } },
      { name: 'rim_grip_d', parent: 'rim', from: { anchor: 'rim_grip_d', rotation: 'anchor' } },
      { name: 'emitter', parent: 'axis', from: { anchor: 'emitter' } },
      { name: 'trail_a', parent: 'emitter', from: { anchor: 'trail_a' } },
      { name: 'trail_b', parent: 'trail_a', from: { anchor: 'trail_b' } },
      { name: 'trail_c', parent: 'trail_b', from: { anchor: 'trail_c' } },
    ],
    // The array order IS the draw order, and `collar` sitting after `plunger` is
    // the adjacency the whole illusion rests on: the moving part has to be hidden
    // where it enters. `near` and `grade` are declared and filled by no fixture,
    // which is legitimate — a slot table fixes where a slot will sit when a cut
    // does carry it.
    slots: [
      { name: 'stage', bone: 'stage' },
      { name: 'mass_pad', bone: 'mass' },
      { name: 'plunger', bone: 'plunger' },
      { name: 'plunger_blur', bone: 'plunger' },
      { name: 'collar', bone: 'rim' },
      { name: 'trail', bone: 'emitter' },
      { name: 'pool', bone: 'rim' },
      { name: 'near', bone: 'mass' },
      { name: 'grade', bone: 'cam' },
    ],
  });
  return rigPath;
}

/**
 * The full articulated cut: two ring meshes, a ribbon on a bone chain, and a
 * measured contact ceiling.
 *
 * 🎯 `contact_depth` is 66 and the deepest key its motion spec asks for is 57, so
 * the smallest whole-pixel edit that crosses the ceiling is +10 — which is what
 * the mutant that drives past it claims, and the claim is only checkable because
 * the gap is stated here.
 */
export function articulatedFixture(): Fixture {
  const dir = makeDir('articulated_probe');
  const rigPath = writeArticulatedRig(dir);

  writePlate(join(dir, 'plates', '00_stage.png'), 480, 270, 'stage', true);
  writePlate(join(dir, 'plates', '04_mass_pad.png'), 130, 90, 'mass pad');
  writePlate(join(dir, 'plates', '01_plunger.png'), 200, 80, 'plunger');
  writePlate(join(dir, 'plates', '01b_plunger_blur.png'), 200, 80, 'blur');
  writePlate(join(dir, 'plates', '02_collar.png'), 105, 105, 'collar');
  writePlate(join(dir, 'plates', '03_trail.png'), 30, 105, 'trail');
  writePlate(join(dir, 'plates', '05_pool.png'), 75, 28, 'pool');

  const manifestPath = join(dir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'rigc-fixture/articulated/1',
    archetype: 'articulated_probe',
    note: 'Synthetic. Every plate is a generated checkerboard; this fixture proves rig mechanics and nothing about appearance.',
    crop: { x: 0, y: 0, w: 480, h: 270, resample: 'none' },
    base: 'plates/00_stage.png',
    insertion: [158, 110],
    axis: ARTICULATED_AXIS,
    stroke: { amplitude: 30, extension: 190, contact_depth: 66 },
    anchors: ARTICULATED_ANCHORS,
    parts: [
      { slot: 'stage', draw_order: 0, image: 'plates/00_stage.png', offset: [0, 0], size: [480, 270] },
      {
        slot: 'mass_pad',
        draw_order: 1,
        image: 'plates/04_mass_pad.png',
        offset: [168, 130],
        size: [130, 90],
        polygon: octagon(168, 130, 130, 90, 18),
        mesh: {
          kind: 'ring',
          hull: 'polygon',
          center: [233, 175],
          inner: 0.5,
          control_bones: ['mass_a', 'mass_b'],
        },
      },
      { slot: 'plunger', draw_order: 2, image: 'plates/01_plunger.png', offset: [130, 90], size: [200, 80] },
      { slot: 'plunger_blur', draw_order: 3, image: 'plates/01b_plunger_blur.png', offset: [130, 90], size: [200, 80] },
      {
        slot: 'collar',
        draw_order: 4,
        image: 'plates/02_collar.png',
        offset: [105, 58],
        size: [105, 105],
        polygon: octagon(105, 58, 105, 105, 22),
        mesh: {
          kind: 'ring',
          hull: 'polygon',
          center: [158, 110],
          inner: 0.47,
          control_bones: ['rim_grip_a', 'rim_grip_b', 'rim_grip_c', 'rim_grip_d'],
        },
      },
      {
        slot: 'trail',
        draw_order: 5,
        image: 'plates/03_trail.png',
        offset: [143, 110],
        size: [30, 105],
        mesh: { kind: 'ribbon', rows: 8, chain: ['trail_a', 'trail_b', 'trail_c'] },
      },
      { slot: 'pool', draw_order: 6, image: 'plates/05_pool.png', offset: [120, 207], size: [75, 28] },
    ],
  });

  const motionPath = join(dir, 'articulated_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'articulated_probe',
    cut: 'articulated_probe',
    easings: { drive: [0.4, 0, 0.2, 1] },
    setup: {
      stage: { attachment: '00_stage' },
      mass_pad: { attachment: '04_mass_pad' },
      plunger: { attachment: '01_plunger' },
      plunger_blur: { attachment: null },
      collar: { attachment: '02_collar' },
      trail: { attachment: '03_trail', color: [1, 1, 1, 0] },
      pool: { attachment: null },
    },
    physics: {
      mass_a_settle: { bone: 'mass_a', x: 0.5, y: 0.5, inertia: 0.55, strength: 90, damping: 0.8, mass: 1, mix: 1 },
      rim_a_settle: { bone: 'rim_grip_a', x: 0.4, y: 0.4, inertia: 0.6, strength: 110, damping: 0.75, mass: 1, mix: 1 },
      trail_a_hang: {
        bone: 'trail_a',
        x: 0.8,
        y: 0.8,
        inertia: 0.4,
        strength: 60,
        damping: 0.7,
        mass: 1,
        gravity: 60,
        mix: 1,
      },
    },
    animations: {
      // Keys `cam`, which drives no mesh — see A15. The bones that do (`mass_*`,
      // `rim_grip_*`, `trail_*`) are driven by physics and never by idle keys.
      idle: {
        duration: 2,
        loop: true,
        tracks: [
          {
            bone: 'cam',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 1, v: [0, 1] },
              { t: 2, v: [0, 0] },
            ],
          },
        ],
      },
      advance_slow: {
        duration: 1.2,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.6, v: [57, 0], ease: 'drive' },
              { t: 1.2, v: [0, 0] },
            ],
          },
          {
            // Legal here, and only here: this fixture declares no containment
            // ceiling, so nothing was measured on an undeformed contour for a
            // scale key to invalidate. The same key on the contained fixture is a
            // defect, which is exactly what one of its mutants asserts.
            bone: 'plunger',
            property: 'scale',
            keys: [
              { t: 0, v: [1, 1] },
              { t: 0.2, v: [1.04, 0.97] },
              { t: 0.8, v: [1, 1] },
            ],
          },
        ],
      },
      advance_fast: {
        duration: 0.5,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.25, v: [57, 0], ease: 'drive' },
              { t: 0.5, v: [0, 0] },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'articulated_probe', dir, rigPath, motionPath, manifestPath, outDir: join(dir, 'spine') };
}

/**
 * The same rig, three plates, and the OTHER ceiling.
 *
 * 🎯 `cap_containment_ceiling` is 96 against a deepest key of 54, so +43 is the
 * smallest whole-pixel edit that crosses it and +42 is not. It declares no
 * contact depth at all — two plates cut from one piece of art are adjacent at
 * rest and never "meet" — which is what makes this a fixture rather than a
 * duplicate: on the other two, the containment assertion has nothing to look at.
 *
 * It also renames a slot. The manifest calls the occluding part `shroud` and maps
 * it onto the rig's `collar` with `rig_slot`, so the join that resolves the two
 * gets exercised by something.
 */
export function containedFixture(): Fixture {
  const dir = makeDir('contained_probe');
  const rigPath = writeArticulatedRig(dir);

  writePlate(join(dir, 'plates', '00_stage.png'), 480, 270, 'stage', true);
  writePlate(join(dir, 'plates', '01_plunger.png'), 200, 80, 'plunger');
  writePlate(join(dir, 'plates', '02_shroud.png'), 105, 105, 'shroud');

  const manifestPath = join(dir, 'manifest.json');
  writeJson(manifestPath, {
    schema: 'rigc-fixture/contained/1',
    archetype: 'articulated_probe',
    note: 'Synthetic. Three plates, no meshes, and the containment ceiling the other fixtures do not declare.',
    crop: { x: 0, y: 0, w: 480, h: 270, resample: 'none' },
    base: 'plates/00_stage.png',
    insertion: [158, 110],
    axis: ARTICULATED_AXIS,
    stroke: { amplitude: 28, extension: 190, cap_containment_ceiling: 96 },
    anchors: ARTICULATED_ANCHORS,
    parts: [
      { slot: 'stage', draw_order: 0, image: 'plates/00_stage.png', offset: [0, 0], size: [480, 270] },
      { slot: 'plunger', draw_order: 2, image: 'plates/01_plunger.png', offset: [130, 90], size: [200, 80] },
      {
        slot: 'shroud',
        rig_slot: 'collar',
        draw_order: 4,
        image: 'plates/02_shroud.png',
        offset: [105, 58],
        size: [105, 105],
      },
    ],
  });

  const motionPath = join(dir, 'contained_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'articulated_probe',
    cut: 'contained_probe',
    easings: { drive: [0.4, 0, 0.2, 1] },
    setup: {
      stage: { attachment: '00_stage' },
      plunger: { attachment: '01_plunger' },
      collar: { attachment: '02_shroud' },
    },
    animations: {
      idle: {
        duration: 2,
        loop: true,
        tracks: [
          {
            bone: 'cam',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 1, v: [0, 1] },
              { t: 2, v: [0, 0] },
            ],
          },
        ],
      },
      advance_slow: {
        duration: 1.2,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.6, v: [54, 0], ease: 'drive' },
              { t: 1.2, v: [0, 0] },
            ],
          },
        ],
      },
      advance_fast: {
        duration: 0.5,
        loop: true,
        tracks: [
          {
            bone: 'plunger',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.25, v: [54, 0], ease: 'drive' },
              { t: 0.5, v: [0, 0] },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'articulated_probe', dir, rigPath, motionPath, manifestPath, outDir: join(dir, 'spine') };
}

// ---------------------------------------------------------------------------
// segments_probe
// ---------------------------------------------------------------------------

/** A fixture with no manifest: the rig spec states everything, and `imagesDir` is where its art is. */
export interface SpecOnlyFixture {
  rig: string;
  dir: string;
  rigPath: string;
  motionPath: string;
  imagesDir: string;
  outDir: string;
}

/** The segments probe's plate: its size, and the two islands' columns (x0 inclusive, x1 exclusive). */
export const SEGMENTS_PLATE = { width: 96, height: 64, rows: [8, 56], islands: [[8, 40], [56, 88]] } as const;

/**
 * One plate of TWO islands, meshed by the `segments` generator over two bone
 * chains — the fourth shape, and the first with no manifest behind it.
 *
 * ⭐ Two islands because that is the case the generator exists to handle: a
 * layer the alpha splits in two is still one attachment, and the lattice has to
 * join the islands into one closed outline or the mesh is refused. The gap
 * between them is wider than one cell, so the join path actually runs and adds
 * cells that hold no art — a gap narrower than a cell would be closed by the
 * lattice itself and the path would never be exercised.
 *
 * Each island hangs under its own two-link chain, so the weights have a real
 * choice to make: a vertex near the left island binds the left chain, one near
 * the right binds the right, and the cells the join added sit between them.
 * The last link of each chain states a `length`, which is what gives it a
 * segment — without one it would have an origin and nothing to measure a
 * distance to.
 */
export function segmentsFixture(): SpecOnlyFixture {
  const dir = makeDir('segments_probe');
  const imagesDir = join(dir, 'parts');
  const { width, height, rows, islands } = SEGMENTS_PLATE;
  const plate = new Plate(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      plate.set(x, y, on ? PAPER : INK);
    }
  }
  plate.maskAlpha((x, y) => (y >= rows[0] && y < rows[1] && islands.some(([x0, x1]) => x >= x0 && x < x1) ? 255 : 0));
  plate.writePng(join(imagesDir, 'cloth.png'));

  const rigPath = join(dir, 'segments_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'segments_probe',
    images: 'parts',
    skeleton: { width: 256, height: 256 },
    invariants: { meshSlots: 1, meshTriangles: 200 },
    bones: [
      { name: 'root' },
      { name: 'body', parent: 'root', x: 0, y: 100 },
      { name: 'left_0', parent: 'body', x: -24, y: 24 },
      { name: 'left_1', parent: 'left_0', x: 0, y: -24, rotation: -90, length: 24 },
      { name: 'right_0', parent: 'body', x: 24, y: 24 },
      { name: 'right_1', parent: 'right_0', x: 0, y: -24, rotation: -90, length: 24 },
    ],
    slots: [{ name: 'cloth', bone: 'body', attachment: 'cloth' }],
    skins: {
      default: {
        cloth: {
          cloth: {
            type: 'mesh',
            image: 'cloth.png',
            generator: {
              kind: 'segments',
              cell: 8,
              bones: [
                ['left_0', 'left_1'],
                ['right_0', 'right_1'],
              ],
              falloff: { radius: 4, maxBones: 3, minWeight: 0.03 },
            },
          },
        },
      },
    },
  });

  const motionPath = join(dir, 'segments_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'segments_probe',
    cut: 'segments_probe',
    easings: {},
    animations: {
      sway: {
        duration: 1,
        loop: true,
        tracks: [
          {
            bone: 'left_1',
            property: 'rotate',
            keys: [
              { t: 0, v: [0] },
              { t: 0.5, v: [20] },
              { t: 1, v: [0] },
            ],
          },
          {
            bone: 'right_1',
            property: 'rotate',
            keys: [
              { t: 0, v: [0] },
              { t: 0.5, v: [-20] },
              { t: 1, v: [0] },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'segments_probe', dir, rigPath, motionPath, imagesDir, outDir: join(dir, 'spine') };
}

// ---------------------------------------------------------------------------
// skirt_probe (issue #1415)
// ---------------------------------------------------------------------------

/**
 * The skirt probe's plate and chains: the plate's size, the chain count, the
 * links per chain and each link's length, the first chain's column and the
 * spacing between chains, all in the part's pixels.
 */
export const SKIRT_PLATE = { width: 192, height: 136, chains: 6, links: 5, link: 24, firstX: 16, spacing: 32, top: 8 } as const;

/** The skirt's `influence` block at rest: the reach covers one neighbouring chain each side, and the cap is the wide one. */
export const SKIRT_INFLUENCE = { radius: 40, across: true, max: 6, shape: 'smooth' } as const;

/**
 * A skirt: one opaque plate under SIX chains of FIVE links, every link on a
 * physics constraint, swayed from the hip — the piece issue #1415 measures a
 * wide `influence` against a narrow one on.
 *
 * ⭐ The chains hang straight down from the hip, `spacing` apart, so a vertex
 * between two chains is the same distance from both and the reach decides
 * whether it blends them: at `radius` 40 against a spacing of 32 a vertex on a
 * chain reaches its neighbours' links and no further, which is what makes the
 * cap a real choice — a vertex has more links in reach than a narrow `max`
 * keeps. The sway turns and slides the hip, so the springs lag by how far
 * each root swings, and adjacent chains move apart: the motion folds measure.
 *
 * Every link has a `length`, because a physics constraint on `rotate` steps
 * off its tip (A23), and the last link's is what gives its chain a segment.
 */
export function skirtFixture(): SpecOnlyFixture {
  const dir = makeDir('skirt_probe');
  const imagesDir = join(dir, 'parts');
  const { width, height, chains, links, link, firstX, spacing, top } = SKIRT_PLATE;
  writePlate(join(imagesDir, 'skirt.png'), width, height, 'skirt');

  const anchor: [number, number] = [width / 2, 0];
  const bones: Array<Record<string, unknown>> = [{ name: 'root' }, { name: 'hip', parent: 'root', x: 0, y: 240 }];
  const chainNames: string[][] = [];
  const physics: Record<string, Record<string, unknown>> = {};
  for (let c = 0; c < chains; c++) {
    const names: string[] = [];
    for (let k = 0; k < links; k++) {
      const name = `skirt_${c}_${k}`;
      names.push(name);
      bones.push(
        k === 0
          ? { name, parent: 'hip', x: firstX + c * spacing - anchor[0], y: -(top - anchor[1]), rotation: -90, length: link }
          : { name, parent: names[k - 1], x: link, y: 0, length: link },
      );
      physics[`${name}_swing`] = { bone: name, rotate: 1, inertia: 0.5, strength: 60, damping: 0.85, mass: 1, mix: 1 };
    }
    chainNames.push(names);
  }

  const rigPath = join(dir, 'skirt_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'skirt_probe',
    images: 'parts',
    skeleton: { width: 320, height: 320 },
    invariants: { meshSlots: 1, meshTriangles: 1000 },
    bones,
    slots: [{ name: 'skirt', bone: 'hip', attachment: 'skirt' }],
    skins: {
      default: {
        skirt: {
          skirt: {
            type: 'mesh',
            image: 'skirt.png',
            generator: { kind: 'segments', cell: 8, bones: chainNames, influence: { ...SKIRT_INFLUENCE }, anchor },
          },
        },
      },
    },
  });

  const motionPath = join(dir, 'skirt_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'skirt_probe',
    cut: 'skirt_probe',
    easings: {},
    physics,
    animations: {
      sway: {
        duration: 2,
        loop: true,
        tracks: [
          {
            bone: 'hip',
            property: 'rotate',
            keys: [
              { t: 0, v: [0] },
              { t: 0.5, v: [12] },
              { t: 1, v: [0] },
              { t: 1.5, v: [-12] },
              { t: 2, v: [0] },
            ],
          },
          {
            bone: 'hip',
            property: 'translate',
            keys: [
              { t: 0, v: [0, 0] },
              { t: 0.5, v: [30, 0] },
              { t: 1, v: [0, 0] },
              { t: 1.5, v: [-30, 0] },
              { t: 2, v: [0, 0] },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'skirt_probe', dir, rigPath, motionPath, imagesDir, outDir: join(dir, 'spine') };
}

// ---------------------------------------------------------------------------
// pass_through_probe
// ---------------------------------------------------------------------------

/**
 * The pass-through probe's numbers (issue #1413), world units: every plate is
 * drawn one texel to a unit, with `writePlate`'s transparent margin of `margin`
 * texels, so a plate's drawn rectangle is its own rectangle inset by `margin`.
 *
 * - `skirt` hangs from `hip`, its top edge on the bone: the plate's centre sits
 *   `skirt.height / 2` below it.
 * - `leg` and `legFront` hang from `thigh`, which is a child of the root, so the
 *   hip's swing does not move them: one plate size, one place, `leg` drawn under
 *   the skirt and `legFront` over it.
 * - At rest the leg's drawn left edge, `thighX − leg.width / 2 + margin`, is
 *   inside the skirt's, `−skirt.width / 2 + margin`: the leg is inside the skirt.
 *
 * `swing` turns the hip `swing` degrees counter-clockwise and back, linearly, over
 * `duration` seconds, which carries the skirt's hem to the right, through the
 * leg; `swingBehind` is the same swing with the leg moved over the skirt by a
 * draw-order key from `behind[0]` to `behind[1]`; `rest` moves nothing.
 * `squash` holds the hip at x scale `squash.scale` and moved by `squash.shift`,
 * so the skirt's drawn left edge sits just inside the leg's — by less than two
 * world units, and by more than two of the skirt's setup-pose cells, which the
 * squash makes `squash.scale` units wide: a run counted in setup cells would read
 * a pass-through the picture does not hold (issue #1413).
 */
export const PASS_PLATE = {
  skirt: { width: 64, height: 96 },
  leg: { width: 24, height: 120 },
  margin: 2,
  hipY: 200,
  thighX: -17,
  swing: 30,
  duration: 2,
  behind: [0.45, 1.55],
  squash: { scale: 0.5, shift: -10.65 },
} as const;

/**
 * A skirt over a leg, and a hem swung through it — the planted pass-through the
 * reading behind `render --pass-through` is held to (issue #1413). Regions only:
 * a region is one affine map, so where its drawn side lands at a frame is the
 * probe's numbers turned by the hip's angle, which the suite derives on its own.
 */
export function passThroughFixture(): SpecOnlyFixture {
  const dir = makeDir('pass_through_probe');
  const imagesDir = join(dir, 'parts');
  const { skirt, leg, hipY, thighX, swing, duration, behind, squash } = PASS_PLATE;
  writePlate(join(imagesDir, 'skirt.png'), skirt.width, skirt.height, 'skirt');
  writePlate(join(imagesDir, 'leg.png'), leg.width, leg.height, 'leg');
  writePlate(join(imagesDir, 'leg_front.png'), leg.width, leg.height, 'leg front');

  const rigPath = join(dir, 'pass_through_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'pass_through_probe',
    images: 'parts',
    skeleton: { width: 160, height: 240 },
    bones: [{ name: 'root' }, { name: 'hip', parent: 'root', x: 0, y: hipY }, { name: 'thigh', parent: 'root', x: thighX, y: hipY }],
    slots: [
      { name: 'leg', bone: 'thigh', attachment: 'leg' },
      { name: 'skirt', bone: 'hip', attachment: 'skirt' },
      { name: 'leg_front', bone: 'thigh', attachment: 'leg_front' },
    ],
    skins: {
      default: {
        leg: { leg: { image: 'leg.png', y: -leg.height / 2 } },
        skirt: { skirt: { image: 'skirt.png', y: -skirt.height / 2 } },
        leg_front: { leg_front: { image: 'leg_front.png', y: -leg.height / 2 } },
      },
    },
  });

  const swingTrack = {
    bone: 'hip',
    property: 'rotate',
    keys: [
      { t: 0, v: [0] },
      { t: duration / 2, v: [swing] },
      { t: duration, v: [0] },
    ],
  };
  const motionPath = join(dir, 'pass_through_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'pass_through_probe',
    cut: 'pass_through_probe',
    easings: {},
    animations: {
      swing: { duration, loop: false, tracks: [swingTrack] },
      swing_behind: {
        duration,
        loop: false,
        drawOrder: [{ t: behind[0], offsets: [{ slot: 'leg', offset: 1 }] }, { t: behind[1] }],
        tracks: [swingTrack],
      },
      rest: { duration: 1, loop: false, tracks: [{ bone: 'hip', property: 'rotate', keys: [{ t: 0, v: [0] }, { t: 1, v: [0] }] }] },
      squash: {
        duration: 1,
        loop: false,
        tracks: [
          { bone: 'hip', property: 'scale', keys: [{ t: 0, v: [squash.scale, 1] }, { t: 1, v: [squash.scale, 1] }] },
          { bone: 'hip', property: 'translate', keys: [{ t: 0, v: [squash.shift, 0] }, { t: 1, v: [squash.shift, 0] }] },
        ],
      },
    },
  });

  return { rig: 'pass_through_probe', dir, rigPath, motionPath, imagesDir, outDir: join(dir, 'spine') };
}

// ---------------------------------------------------------------------------
// overlap_probe
// ---------------------------------------------------------------------------

/**
 * The overlap probe's numbers (issue #1480), world units: every plate is drawn
 * one texel to a unit. `stage` is opaque — no transparent margin — and every
 * other plate carries `writePlate`'s margin of `margin` texels.
 *
 * - `stage` hangs on the root, centred on it, drawn first: every other slot lies
 *   wholly on it on every frame, which is layering the motion does not move.
 * - `body` sits on its own bone at `bodyAt`, still; `arm` on its own bone at
 *   `armY`, drawn after the body.
 * - `cross` slides the arm along x from `from` to `to`, linearly over
 *   `duration` seconds, carrying it across the body and out the other side;
 *   `cross_behind` is the same slide with a draw-order key at 0 that puts the arm
 *   before the body for the whole animation; `still` holds the arm at `from`,
 *   clear of the body.
 */
export const OVERLAP_PLATE = {
  stage: { width: 200, height: 160 },
  body: { width: 40, height: 80 },
  arm: { width: 24, height: 16 },
  margin: 2,
  bodyAt: [0, 0],
  armY: 10,
  from: -60,
  to: 60,
  duration: 2,
} as const;

/**
 * A still body and an arm slid across it — the crossing the reading behind
 * `render --overlaps` is held to (issue #1480). Regions only, and only slid:
 * which frame pixel each draws is the probe's numbers through the frame's own
 * viewport, which the suite derives on its own.
 */
export function overlapFixture(): SpecOnlyFixture {
  const dir = makeDir('overlap_probe');
  const imagesDir = join(dir, 'parts');
  const { stage, body, arm, bodyAt, armY, from, to, duration } = OVERLAP_PLATE;
  writePlate(join(imagesDir, 'stage.png'), stage.width, stage.height, 'stage', true);
  writePlate(join(imagesDir, 'body.png'), body.width, body.height, 'body');
  writePlate(join(imagesDir, 'arm.png'), arm.width, arm.height, 'arm');

  const rigPath = join(dir, 'overlap_probe.rig.json');
  writeJson(rigPath, {
    spec: 'rigc-rig/1',
    name: 'overlap_probe',
    images: 'parts',
    skeleton: { width: stage.width, height: stage.height },
    bones: [{ name: 'root' }, { name: 'body', parent: 'root', x: bodyAt[0], y: bodyAt[1] }, { name: 'arm', parent: 'root', x: 0, y: armY }],
    slots: [
      { name: 'stage', bone: 'root', attachment: 'stage' },
      { name: 'body', bone: 'body', attachment: 'body' },
      { name: 'arm', bone: 'arm', attachment: 'arm' },
    ],
    skins: {
      default: {
        stage: { stage: { image: 'stage.png' } },
        body: { body: { image: 'body.png' } },
        arm: { arm: { image: 'arm.png' } },
      },
    },
  });

  const slide = { bone: 'arm', property: 'translate', keys: [{ t: 0, v: [from, 0] }, { t: duration, v: [to, 0] }] };
  const motionPath = join(dir, 'overlap_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'overlap_probe',
    cut: 'overlap_probe',
    easings: {},
    animations: {
      cross: { duration, loop: false, tracks: [slide] },
      cross_behind: { duration, loop: false, drawOrder: [{ t: 0, offsets: [{ slot: 'arm', offset: -1 }] }], tracks: [slide] },
      still: { duration: 1, loop: false, tracks: [{ bone: 'arm', property: 'translate', keys: [{ t: 0, v: [from, 0] }, { t: 1, v: [from, 0] }] }] },
    },
  });

  return { rig: 'overlap_probe', dir, rigPath, motionPath, imagesDir, outDir: join(dir, 'spine') };
}

// ---------------------------------------------------------------------------
// leg_stop_probe
// ---------------------------------------------------------------------------

/**
 * The leg-stop probe's numbers (issue #1413), world units, every plate one texel
 * to a unit inside `writePlate`'s transparent margin of `margin`:
 *
 * - `skirt` is hung from `hip` by its top edge (its top centre sits on the bone)
 *   and meshed over two chains: `hem` on its left side, rooted at `root` (the
 *   plate's pixels) and swinging, and `side` at the mirrored column, still; each
 *   chain `links` links of `link` units, hanging straight down.
 * - `leg` hangs from `thigh`, a child of the root at `thighX`, drawn under the
 *   skirt: at rest its drawn left edge is inside the skirt's.
 * - `touch` is the point on the leg's drawn left edge at the hem chain's tip
 *   height, in `thigh`'s local space — where the stop's frame aims.
 * - `swing` turns `hem`'s control bone that many degrees counter-clockwise —
 *   toward the leg — and back over `duration` seconds, so the skirt's side passes
 *   into the leg; `inward`/`outward` and `lower` are the stop's ranges.
 */
export const LEG_STOP_PLATE = {
  skirt: { width: 64, height: 96 },
  leg: { width: 24, height: 120 },
  hipY: 200,
  thighX: -14,
  root: [4, 4],
  links: 2,
  link: 40,
  touch: [-10, -84],
  swing: 20,
  duration: 2,
  inward: 0,
  outward: 60,
  lower: { inward: 0, outward: 30 },
} as const;

/** A spec-only fixture with the stop's two companions: the same network written by hand, and the chain with no stop. */
export interface LegStopFixture extends SpecOnlyFixture {
  /** The rig with the network the declaration expands to written out bone by bone (LG01). */
  handRigPath: string;
  /** The rig with no stop at all: the mesh weighted to the swinging links themselves (LG02). */
  freeRigPath: string;
}

/**
 * The network a stop on `hem` stands for, written by hand from `LEG_STOP_PLATE`
 * with plain trigonometry — never by calling the expansion, or LG01 would be the
 * expansion agreeing with itself. `hip` and `thigh` are unrotated and sit at one
 * height, and `hem0_ctl` points straight down (−90°), so the aim line, the
 * frame's rotation in `hem0_ctl` and the link's rest angle off the aim line are
 * each one `atan2` and a subtraction.
 */
export function legStopHandNetwork(): { bones: Array<Record<string, unknown>>; constraints: Array<Record<string, unknown>> } {
  const { skirt, root, link, touch, thighX, inward, outward, lower } = LEG_STOP_PLATE;
  const degrees = (r: number): number => r / (Math.PI / 180);
  const rootLocal: [number, number] = [root[0] - skirt.width / 2, -root[1]];
  const dx = thighX + touch[0] - rootLocal[0];
  const dy = touch[1] - rootLocal[1];
  const aim = degrees(Math.atan2(dy, dx));
  const rest = -90 - aim;
  const sign = rest < 0 ? 1 : -1;
  const first = [rest - sign * outward, rest - sign * inward].sort((a, b) => a - b);
  const below = [0 - sign * lower.outward, 0 - sign * lower.inward].sort((a, b) => a - b);
  const clamp = (name: string, source: string, target: string, [lo, hi]: number[]): Record<string, unknown> => ({
    name,
    type: 'transform',
    source,
    bones: [target],
    localSource: true,
    localTarget: true,
    clamp: true,
    properties: { rotate: { offset: lo, to: { rotate: { offset: lo, max: hi, scale: 1 } } } },
    mixRotate: 1,
  });
  return {
    bones: [
      { name: 'hem_stop', parent: 'hem0_ctl', length: link, rotation: aim + 90 },
      { name: 'hem0_rel', parent: 'hem_stop', length: link, rotation: rest },
      { name: 'hem0_d', parent: 'hem_stop', length: link, rotation: rest },
      { name: 'hem1_d', parent: 'hem1_ctl', length: link },
      { name: 'hem_touch', parent: 'thigh', x: touch[0], y: touch[1] },
    ],
    constraints: [
      { name: 'hem_stop_aim', type: 'ik', bones: ['hem_stop'], target: 'hem_touch', mix: 1 },
      { name: 'hem0_rel_copy', type: 'transform', source: 'hem0', bones: ['hem0_rel'], properties: { rotate: { to: { rotate: {} } } }, mixRotate: 1 },
      clamp('hem0_clamp', 'hem0_rel', 'hem0_d', first),
      clamp('hem1_clamp', 'hem1', 'hem1_d', below),
    ],
  };
}

/**
 * A skirt chain swung through a leg, three ways: held by a `stops` declaration,
 * held by the same network written by hand, and not held at all — the pair
 * issue #1413's leg stop is read with (`render --pass-through`), and the
 * equality its expansion is held to. Each link swings by a physics constraint
 * the rig spec declares, which is what a stop holds.
 */
export function legStopFixture(): LegStopFixture {
  const dir = makeDir('leg_stop_probe');
  const imagesDir = join(dir, 'parts');
  const { skirt, leg, hipY, thighX, root, links, link, touch, swing, duration, inward, outward, lower } = LEG_STOP_PLATE;
  writePlate(join(imagesDir, 'skirt.png'), skirt.width, skirt.height, 'skirt');
  writePlate(join(imagesDir, 'leg.png'), leg.width, leg.height, 'leg');

  const anchor: [number, number] = [skirt.width / 2, 0];
  /** One chain as authored: each link under its control bone, each control below `above(k - 1)`. */
  const chain = (prefix: string, column: number, above: (k: number) => string): Array<Record<string, unknown>> => {
    const out: Array<Record<string, unknown>> = [];
    for (let k = 0; k < links; k++) {
      out.push(
        k === 0
          ? { name: `${prefix}0_ctl`, parent: 'hip', x: column - anchor[0], y: -(root[1] - anchor[1]), rotation: -90, length: link }
          : { name: `${prefix}${k}_ctl`, parent: above(k - 1), x: link, y: 0, length: link },
        { name: `${prefix}${k}`, parent: `${prefix}${k}_ctl`, length: link },
      );
    }
    return out;
  };
  const names = (prefix: string, suffix = ''): string[] => Array.from({ length: links }, (_, k) => `${prefix}${k}${suffix}`);
  const head = [{ name: 'root' }, { name: 'hip', parent: 'root', x: 0, y: hipY }, { name: 'thigh', parent: 'root', x: thighX, y: hipY }];
  const side = chain('side', skirt.width - root[0], (k) => `side${k}`);
  const swung = names('hem').map((bone) => ({ type: 'physics', name: `${bone}_phys`, bone, rotate: 1, inertia: 0.5, strength: 80, damping: 0.85, mass: 1, mix: 1 }));
  const rigOf = (bones: Array<Record<string, unknown>>, hem: string[], constraints: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    spec: 'rigc-rig/1',
    name: 'leg_stop_probe',
    images: 'parts',
    skeleton: { width: 160, height: 240 },
    invariants: { meshSlots: 1, meshTriangles: 1000 },
    bones,
    slots: [
      { name: 'leg', bone: 'thigh', attachment: 'leg' },
      { name: 'skirt', bone: 'hip', attachment: 'skirt' },
    ],
    skins: {
      default: {
        leg: { leg: { image: 'leg.png', y: -leg.height / 2 } },
        skirt: {
          skirt: {
            type: 'mesh',
            image: 'skirt.png',
            generator: { kind: 'segments', cell: 8, bones: [hem, names('side')], influence: { radius: 40, across: true, max: 4, shape: 'smooth' }, anchor },
          },
        },
      },
    },
    constraints,
    ...extra,
  });
  const stopped = chain('hem', root[0], (k) => `hem${k}_d`);

  const rigPath = join(dir, 'leg_stop_probe.rig.json');
  writeJson(
    rigPath,
    rigOf([...head, ...stopped, ...side], names('hem', '_d'), swung, {
      stops: [{ chain: 'hem', links: names('hem'), against: 'thigh', at: [touch[0], touch[1]], inward, outward, lower: { ...lower } }],
    }),
  );

  // The same rig with the network written out where the expansion puts it: the
  // frame before the first link, its `_rel` and `_d` after it, a lower link's
  // `_d` after that link, the point last; the aim before the first link's swing,
  // the copy and the clamp after it, a lower link's clamp after its swing.
  const hand = legStopHandNetwork();
  const pick = (list: Array<Record<string, unknown>>, name: string): Record<string, unknown> => list.find((b) => b.name === name) as Record<string, unknown>;
  const handBones: Array<Record<string, unknown>> = [...head];
  for (const bone of stopped) {
    if (bone.name === 'hem0') handBones.push(pick(hand.bones, 'hem_stop'));
    handBones.push(bone);
    if (bone.name === 'hem0') handBones.push(pick(hand.bones, 'hem0_rel'), pick(hand.bones, 'hem0_d'));
    if (bone.name === 'hem1') handBones.push(pick(hand.bones, 'hem1_d'));
  }
  handBones.push(...side, pick(hand.bones, 'hem_touch'));
  const handConstraints = [
    pick(hand.constraints, 'hem_stop_aim'),
    swung[0],
    pick(hand.constraints, 'hem0_rel_copy'),
    pick(hand.constraints, 'hem0_clamp'),
    swung[1],
    pick(hand.constraints, 'hem1_clamp'),
  ];
  const handRigPath = join(dir, 'leg_stop_probe.hand.rig.json');
  writeJson(handRigPath, rigOf(handBones, names('hem', '_d'), handConstraints));

  const freeRigPath = join(dir, 'leg_stop_probe.free.rig.json');
  writeJson(freeRigPath, rigOf([...head, ...chain('hem', root[0], (k) => `hem${k}`), ...side], names('hem'), swung));

  const motionPath = join(dir, 'leg_stop_probe.motion.json');
  writeJson(motionPath, {
    spec: 'rigc-motion/1',
    archetype: 'leg_stop_probe',
    cut: 'leg_stop_probe',
    easings: {},
    animations: {
      swing: {
        duration,
        loop: false,
        tracks: [
          {
            bone: 'hem0_ctl',
            property: 'rotate',
            keys: [
              { t: 0, v: [0] },
              { t: duration / 2, v: [swing] },
              { t: duration, v: [0] },
            ],
          },
        ],
      },
    },
  });

  return { rig: 'leg_stop_probe', dir, rigPath, motionPath, imagesDir, outDir: join(dir, 'spine'), handRigPath, freeRigPath };
}
